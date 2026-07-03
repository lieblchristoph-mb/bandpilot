using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using BandKalender.Data;
using BandKalender.Models;
using BandKalender.Services;

namespace BandKalender.Endpoints;

public static class SongEndpoints
{
    public static IEndpointRouteBuilder MapSongEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/songs", async (HttpContext ctx, AppDbContext db) =>
        {
            var callerId = ctx.Items.ContainsKey("memberId") ? (int?)ctx.Items["memberId"] : null;
            var songs = await db.Songs.OrderBy(s => s.Title).ToListAsync();
            var files = await db.SongFiles.ToListAsync();
            var songRatings = await db.SongRatings.ToListAsync();

            return Results.Ok(songs.Select(s => {
                var sr = songRatings.Where(r => r.SongId == s.Id).ToList();
                var myRating = callerId.HasValue ? sr.FirstOrDefault(r => r.MemberId == callerId.Value) : null;
                return new
                {
                    s.Id, s.Title, s.Notes, s.Category,
                    fileCount = files.Count(f => f.SongId == s.Id),
                    avgRating = sr.Any() ? (double?)sr.Average(r => r.Stars) : null,
                    ratingCount = sr.Count,
                    avgDurationSeconds = files.Where(f => f.SongId == s.Id && f.DurationSeconds.HasValue).Any()
                        ? (double?)files.Where(f => f.SongId == s.Id && f.DurationSeconds.HasValue).Average(f => f.DurationSeconds!.Value)
                        : null,
                    myStars = myRating?.Stars ?? 0
                };
            }));
        });

        app.MapPost("/api/songs", async (AppDbContext db, SongDto dto) =>
        {
            var title = (dto.Title ?? "").Trim();
            if (string.IsNullOrWhiteSpace(title)) return Results.BadRequest(new { error = "Titel fehlt" });
            var cat = dto.Category?.Trim() is "cover" or "wip" or "idea" ? dto.Category.Trim() : "own";
            var song = new Song { Title = title, Notes = dto.Notes?.Trim(), Category = cat };
            db.Songs.Add(song);
            await db.SaveChangesAsync();
            return Results.Ok(song);
        });

        app.MapPut("/api/songs/{id:int}", async (AppDbContext db, int id, SongDto dto) =>
        {
            var song = await db.Songs.FindAsync(id);
            if (song is null) return Results.NotFound();
            var title = (dto.Title ?? "").Trim();
            if (string.IsNullOrWhiteSpace(title)) return Results.BadRequest(new { error = "Titel fehlt" });
            song.Title = title;
            song.Category = dto.Category?.Trim() is "cover" or "wip" or "idea" ? dto.Category.Trim() : "own";
            if (dto.Notes is not null) song.Notes = dto.Notes.Trim() == "" ? null : dto.Notes.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(song);
        });

        app.MapDelete("/api/songs/{id:int}", async (AppDbContext db, IWebHostEnvironment env, int id) =>
        {
            var song = await db.Songs.FindAsync(id);
            if (song is null) return Results.NotFound();

            var files = await db.SongFiles.Where(f => f.SongId == id).ToListAsync();
            foreach (var f in files)
            {
                var path = Path.Combine(env.WebRootPath, "uploads", "songs", f.FileName);
                if (File.Exists(path)) File.Delete(path);
            }
            db.SongFiles.RemoveRange(files);
            db.SongRatings.RemoveRange(db.SongRatings.Where(r => r.SongId == id));
            db.SetlistSongs.RemoveRange(db.SetlistSongs.Where(e => e.SongId == id));
            db.Songs.Remove(song);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        app.MapGet("/api/songs/{id:int}/files", async (HttpContext ctx, AppDbContext db, int id) =>
        {
            var memberId = (int)ctx.Items["memberId"]!;
            var files = await db.SongFiles.Where(f => f.SongId == id).OrderBy(f => f.Id).ToListAsync();
            var fileIds = files.Select(f => f.Id).ToList();
            var ratings = await db.FileRatings.Where(r => fileIds.Contains(r.SongFileId)).ToListAsync();

            return Results.Ok(files.Select(f => {
                var fr = ratings.Where(r => r.SongFileId == f.Id).ToList();
                var mine = fr.FirstOrDefault(r => r.MemberId == memberId);
                return new
                {
                    f.Id, f.SongId, f.FileName, f.OriginalName, f.FileSize, f.DurationSeconds,
                    avgRating = fr.Any() ? (double?)fr.Average(r => r.Stars) : null,
                    ratingCount = fr.Count,
                    myRating = mine is null ? null : new { mine.Stars, mine.Note },
                    allRatings = fr.Select(r => new { r.MemberId, r.Stars, r.Note }).ToList()
                };
            }));
        });

        app.MapPost("/api/songs/{id:int}/files", async (HttpContext ctx, AppDbContext db, IWebHostEnvironment env, int id) =>
        {
            var song = await db.Songs.FindAsync(id);
            if (song is null) return Results.NotFound();

            var form = await ctx.Request.ReadFormAsync();
            var file = form.Files.GetFile("file");
            if (file is null) return Results.BadRequest(new { error = "Keine Datei" });

            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!new[] { ".mp4", ".mp3", ".wav", ".m4a", ".ogg", ".webm" }.Contains(ext))
                return Results.BadRequest(new { error = "Nur Audio/Video-Dateien erlaubt (.mp4, .mp3, .wav, .m4a, .ogg, .webm)" });

            var storedName = $"{Guid.NewGuid()}{ext}";
            var uploadPath = Path.Combine(env.WebRootPath, "uploads", "songs");
            Directory.CreateDirectory(uploadPath);

            await using var stream = File.Create(Path.Combine(uploadPath, storedName));
            await file.CopyToAsync(stream);

            var durationStr = form["duration"].ToString();
            double? duration = double.TryParse(durationStr, System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var d) && d > 0 ? d : null;

            var songFile = new SongFile { SongId = id, FileName = storedName, OriginalName = file.FileName, FileSize = file.Length, DurationSeconds = duration };
            db.SongFiles.Add(songFile);
            await db.SaveChangesAsync();
            return Results.Ok(songFile);
        });

        app.MapPut("/api/songs/{id:int}/files/{fileId:int}", async (AppDbContext db, int id, int fileId, FileRenameDto dto) =>
        {
            var file = await db.SongFiles.FirstOrDefaultAsync(f => f.Id == fileId && f.SongId == id);
            if (file is null) return Results.NotFound();
            var name = (dto.OriginalName ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { error = "Name fehlt" });
            file.OriginalName = name;
            await db.SaveChangesAsync();
            return Results.Ok(file);
        });

        app.MapDelete("/api/songs/{id:int}/files/{fileId:int}", async (AppDbContext db, IWebHostEnvironment env, int id, int fileId) =>
        {
            var file = await db.SongFiles.FirstOrDefaultAsync(f => f.Id == fileId && f.SongId == id);
            if (file is null) return Results.NotFound();

            var path = Path.Combine(env.WebRootPath, "uploads", "songs", file.FileName);
            if (File.Exists(path)) File.Delete(path);
            db.FileRatings.RemoveRange(db.FileRatings.Where(r => r.SongFileId == fileId));
            db.SongFiles.Remove(file);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        app.MapPut("/api/songs/{id:int}/files/{fileId:int}/rating", async (HttpContext ctx, AppDbContext db, int id, int fileId, RatingDto dto) =>
        {
            var memberId = (int)ctx.Items["memberId"]!;
            var file = await db.SongFiles.FirstOrDefaultAsync(f => f.Id == fileId && f.SongId == id);
            if (file is null) return Results.NotFound();

            var existing = await db.FileRatings.FirstOrDefaultAsync(r => r.SongFileId == fileId && r.MemberId == memberId);
            if (existing is null) { existing = new FileRating { SongFileId = fileId, MemberId = memberId }; db.FileRatings.Add(existing); }
            existing.Stars = Math.Clamp(dto.Stars, 1, 5);
            existing.Note = dto.Note;
            await db.SaveChangesAsync();
            return Results.Ok(existing);
        });

        app.MapGet("/api/songs/{id:int}/ratings", async (AppDbContext db, int id) =>
            Results.Ok(await db.SongRatings.Where(r => r.SongId == id).ToListAsync()));

        app.MapPut("/api/songs/{id:int}/rating", async (HttpContext ctx, AppDbContext db, int id, RatingDto dto) =>
        {
            var memberId = (int)ctx.Items["memberId"]!;
            var existing = await db.SongRatings.FirstOrDefaultAsync(r => r.SongId == id && r.MemberId == memberId);
            if (existing is null) { existing = new SongRating { SongId = id, MemberId = memberId }; db.SongRatings.Add(existing); }
            existing.Stars = Math.Clamp(dto.Stars, 1, 5);
            existing.Note = dto.Note;
            await db.SaveChangesAsync();
            return Results.Ok(existing);
        });

        app.MapPost("/api/songs/{songId:int}/files/{fileId:int}/notify", async (HttpContext ctx, AppDbContext db, IServiceScopeFactory scopeFactory, int songId, int fileId) =>
        {
            var callerId = (int)ctx.Items["memberId"]!;
            var caller = await db.Members.FindAsync(callerId);
            var song = await db.Songs.FindAsync(songId);
            var file = await db.SongFiles.FirstOrDefaultAsync(f => f.Id == fileId && f.SongId == songId);
            if (song is null || file is null) return Results.NotFound();

            var senderName = caller?.DisplayName ?? caller?.Name ?? "Jemand";
            var payload = JsonSerializer.Serialize(new
            {
                title = $"🎵 Neue Aufnahme: {song.Title}",
                body  = $"{senderName} hat eine Aufnahme hochgeladen – hör rein und bewerte sie!",
                url   = $"/songs.html?songId={songId}"
            });
            var capturedId = callerId;
            PushService.FireAndForget(
                scopeFactory,
                sdb => sdb.PushSubs.Where(s => s.MemberId != capturedId).ToListAsync(),
                payload);

            return Results.Ok();
        });

        return app;
    }
}
