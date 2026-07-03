using Microsoft.EntityFrameworkCore;
using BandKalender.Data;
using BandKalender.Models;

namespace BandKalender.Endpoints;

public static class SetlistEndpoints
{
    public static IEndpointRouteBuilder MapSetlistEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/setlists", async (AppDbContext db) =>
        {
            var setlists = await db.Setlists.OrderByDescending(s => s.Id).ToListAsync();
            var ratings = await db.SetlistRatings.ToListAsync();
            var entries = await db.SetlistSongs.ToListAsync();
            return Results.Ok(setlists.Select(s => new
            {
                s.Id, s.Name, s.ConcertDate, s.Notes,
                songCount = entries.Count(e => e.SetlistId == s.Id),
                avgRating = ratings.Where(r => r.SetlistId == s.Id).Any() ? (double?)ratings.Where(r => r.SetlistId == s.Id).Average(r => r.Stars) : null,
                ratingCount = ratings.Count(r => r.SetlistId == s.Id)
            }));
        });

        app.MapPost("/api/setlists", async (AppDbContext db, SetlistDto dto) =>
        {
            var name = (dto.Name ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { error = "Name fehlt" });
            var setlist = new Setlist { Name = name, ConcertDate = dto.ConcertDate?.Trim(), Notes = dto.Notes?.Trim() };
            db.Setlists.Add(setlist);
            await db.SaveChangesAsync();
            return Results.Ok(setlist);
        });

        app.MapPut("/api/setlists/{id:int}", async (AppDbContext db, int id, SetlistDto dto) =>
        {
            var setlist = await db.Setlists.FindAsync(id);
            if (setlist is null) return Results.NotFound();
            var name = (dto.Name ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { error = "Name fehlt" });
            setlist.Name = name;
            if (dto.ConcertDate is not null) setlist.ConcertDate = dto.ConcertDate.Trim() == "" ? null : dto.ConcertDate.Trim();
            if (dto.Notes is not null) setlist.Notes = dto.Notes.Trim() == "" ? null : dto.Notes.Trim();
            await db.SaveChangesAsync();
            return Results.Ok(setlist);
        });

        app.MapGet("/api/setlists/{id:int}", async (AppDbContext db, int id) =>
        {
            var setlist = await db.Setlists.FindAsync(id);
            if (setlist is null) return Results.NotFound();

            var entries = await db.SetlistSongs.Where(e => e.SetlistId == id).OrderBy(e => e.Position).ToListAsync();
            var songIds = entries.Select(e => e.SongId).ToList();
            var songs = await db.Songs.Where(s => songIds.Contains(s.Id)).ToListAsync();
            var songFiles = await db.SongFiles.Where(f => songIds.Contains(f.SongId)).ToListAsync();
            var ratings = await db.SetlistRatings.Where(r => r.SetlistId == id).ToListAsync();

            double totalDuration = 0;
            var songEntries = entries.Select(e =>
            {
                var durations = songFiles.Where(f => f.SongId == e.SongId && f.DurationSeconds.HasValue).Select(f => f.DurationSeconds!.Value).ToList();
                var avgDur = durations.Any() ? (double?)durations.Average() : null;
                if (avgDur.HasValue) totalDuration += avgDur.Value;
                return new { e.Id, e.SongId, e.Position, title = songs.FirstOrDefault(s => s.Id == e.SongId)?.Title ?? "?", avgDurationSeconds = avgDur };
            }).ToList();

            return Results.Ok(new
            {
                setlist.Id, setlist.Name, setlist.ConcertDate, setlist.Notes,
                songs = songEntries,
                totalDurationSeconds = totalDuration > 0 ? (double?)totalDuration : null,
                ratings
            });
        });

        app.MapPost("/api/setlists/{id:int}/copy", async (AppDbContext db, int id) =>
        {
            var original = await db.Setlists.FindAsync(id);
            if (original is null) return Results.NotFound();

            var copy = new Setlist { Name = original.Name + " (Kopie)", Notes = original.Notes };
            db.Setlists.Add(copy);
            await db.SaveChangesAsync();

            var songs = await db.SetlistSongs.Where(e => e.SetlistId == id).OrderBy(e => e.Position).ToListAsync();
            foreach (var s in songs)
                db.SetlistSongs.Add(new SetlistSong { SetlistId = copy.Id, SongId = s.SongId, Position = s.Position });
            await db.SaveChangesAsync();

            return Results.Ok(copy);
        });

        app.MapGet("/api/setlists/concert/{date}/ics", async (AppDbContext db, string date) =>
        {
            var setlist = await db.Setlists.FirstOrDefaultAsync(s => s.ConcertDate == date);
            var name = setlist?.Name ?? "Konzert";
            var dtStart = date.Replace("-", "");
            var dtEnd = DateTime.Parse(date).AddDays(1).ToString("yyyyMMdd");
            var ics = $"""
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//The Dead App Notes//DE
BEGIN:VEVENT
UID:konzert-{date}@thedeadnotesapp.duckdns.org
DTSTART;VALUE=DATE:{dtStart}
DTEND;VALUE=DATE:{dtEnd}
SUMMARY:{name}
END:VEVENT
END:VCALENDAR
""";
            return Results.Text(ics, "text/calendar", System.Text.Encoding.UTF8);
        });

        app.MapDelete("/api/setlists/{id:int}", async (AppDbContext db, int id) =>
        {
            var setlist = await db.Setlists.FindAsync(id);
            if (setlist is null) return Results.NotFound();
            db.SetlistSongs.RemoveRange(db.SetlistSongs.Where(e => e.SetlistId == id));
            db.SetlistRatings.RemoveRange(db.SetlistRatings.Where(r => r.SetlistId == id));
            db.Setlists.Remove(setlist);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        app.MapPost("/api/setlists/{id:int}/songs", async (AppDbContext db, int id, SetlistSongDto dto) =>
        {
            if (await db.Setlists.FindAsync(id) is null) return Results.NotFound();
            var maxPos = await db.SetlistSongs.Where(e => e.SetlistId == id).MaxAsync(e => (int?)e.Position) ?? 0;
            var entry = new SetlistSong { SetlistId = id, SongId = dto.SongId, Position = maxPos + 1 };
            db.SetlistSongs.Add(entry);
            await db.SaveChangesAsync();
            return Results.Ok(entry);
        });

        app.MapDelete("/api/setlists/{id:int}/songs/{entryId:int}", async (AppDbContext db, int id, int entryId) =>
        {
            var entry = await db.SetlistSongs.FirstOrDefaultAsync(e => e.Id == entryId && e.SetlistId == id);
            if (entry is null) return Results.NotFound();
            db.SetlistSongs.Remove(entry);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        app.MapPut("/api/setlists/{id:int}/songs/order", async (AppDbContext db, int id, OrderDto dto) =>
        {
            var entries = await db.SetlistSongs.Where(e => e.SetlistId == id).ToListAsync();
            for (int i = 0; i < dto.EntryIds.Count; i++)
            {
                var entry = entries.FirstOrDefault(e => e.Id == dto.EntryIds[i]);
                if (entry is not null) entry.Position = i + 1;
            }
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        app.MapPut("/api/setlists/{id:int}/rating", async (HttpContext ctx, AppDbContext db, int id, RatingDto dto) =>
        {
            var memberId = (int)ctx.Items["memberId"]!;
            var existing = await db.SetlistRatings.FirstOrDefaultAsync(r => r.SetlistId == id && r.MemberId == memberId);
            if (existing is null) { existing = new SetlistRating { SetlistId = id, MemberId = memberId }; db.SetlistRatings.Add(existing); }
            existing.Stars = Math.Clamp(dto.Stars, 1, 5);
            existing.Note = dto.Note;
            await db.SaveChangesAsync();
            return Results.Ok(existing);
        });

        app.MapPost("/api/setlists/{id:int}/autofill", async (AppDbContext db, int id, AutofillDto dto) =>
        {
            if (await db.Setlists.FindAsync(id) is null) return Results.NotFound();
            if (!dto.Count.HasValue && !dto.TargetMinutes.HasValue)
                return Results.BadRequest(new { error = "count oder targetMinutes erforderlich" });

            var songs = await db.Songs.ToListAsync();
            var files = await db.SongFiles.ToListAsync();
            var songRatings = await db.SongRatings.ToListAsync();
            var coverCount = Math.Max(0, dto.CoverCount);

            var allStats = songs.Select(s =>
            {
                var sf = files.Where(f => f.SongId == s.Id).ToList();
                var sr = songRatings.Where(r => r.SongId == s.Id).ToList();
                var avgRating = sr.Any() ? (double?)sr.Average(r => r.Stars) : null;
                var durFiles = sf.Where(f => f.DurationSeconds.HasValue).ToList();
                var avgDuration = durFiles.Any() ? (double?)durFiles.Average(f => f.DurationSeconds!.Value) : null;
                return new { s.Id, s.Category, avgRating, avgDuration };
            })
            .OrderByDescending(x => x.avgRating ?? -1)
            .ThenBy(x => x.Id)
            .ToList();

            var ownStats = allStats.Where(x => x.Category != "cover" && x.Category != "wip" && x.Category != "idea").ToList();
            var coverStats = allStats.Where(x => x.Category == "cover").ToList();
            var selectedCovers = coverStats.Take(coverCount).Select(x => x.Id).ToList();

            List<int> selectedOwn;
            if (dto.Count.HasValue)
            {
                var ownCount = Math.Max(0, dto.Count.Value - selectedCovers.Count);
                selectedOwn = ownStats.Take(ownCount).Select(x => x.Id).ToList();
            }
            else
            {
                var coverDuration = coverStats.Take(coverCount)
                    .Where(x => x.avgDuration.HasValue)
                    .Sum(x => x.avgDuration!.Value);
                var targetSec = dto.TargetMinutes!.Value * 60.0 - coverDuration;
                double total = 0;
                selectedOwn = new List<int>();
                foreach (var s in ownStats.Where(x => x.avgDuration.HasValue))
                {
                    if (total + s.avgDuration!.Value > targetSec) break;
                    selectedOwn.Add(s.Id);
                    total += s.avgDuration.Value;
                }
            }

            var selectedIds = selectedOwn.Concat(selectedCovers).ToList();
            db.SetlistSongs.RemoveRange(db.SetlistSongs.Where(e => e.SetlistId == id));
            for (int i = 0; i < selectedIds.Count; i++)
                db.SetlistSongs.Add(new SetlistSong { SetlistId = id, SongId = selectedIds[i], Position = i + 1 });
            await db.SaveChangesAsync();

            return Results.Ok(new { count = selectedIds.Count });
        });

        app.MapGet("/api/setlists/{id:int}/play", async (AppDbContext db, int id) =>
        {
            var entries = await db.SetlistSongs.Where(e => e.SetlistId == id).OrderBy(e => e.Position).ToListAsync();
            if (!entries.Any()) return Results.Ok(Array.Empty<object>());

            var songIds = entries.Select(e => e.SongId).ToList();
            var songs = await db.Songs.Where(s => songIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id);
            var allFiles = await db.SongFiles.Where(f => songIds.Contains(f.SongId)).ToListAsync();
            var audioExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".mp3", ".wav", ".m4a", ".ogg", ".webm" };
            var audioFiles = allFiles.Where(f => audioExts.Contains(Path.GetExtension(f.OriginalName ?? ""))).ToList();
            var fileIds = audioFiles.Select(f => f.Id).ToList();
            var ratings = await db.FileRatings.Where(r => fileIds.Contains(r.SongFileId)).ToListAsync();

            var result = new List<object>();
            foreach (var entry in entries)
            {
                var filesForSong = audioFiles.Where(f => f.SongId == entry.SongId).ToList();
                if (!filesForSong.Any()) continue;

                var best = filesForSong
                    .Select(f => new {
                        file = f,
                        avg = ratings.Where(r => r.SongFileId == f.Id).Select(r => (double?)r.Stars).DefaultIfEmpty(null).Average()
                    })
                    .OrderByDescending(x => x.avg ?? -1)
                    .ThenByDescending(x => x.file.DurationSeconds ?? 0)
                    .ThenByDescending(x => x.file.Id)
                    .First();

                songs.TryGetValue(entry.SongId, out var song);
                result.Add(new {
                    songId = entry.SongId,
                    title = song?.Title ?? "?",
                    fileId = best.file.Id,
                    fileName = best.file.FileName,
                    originalName = best.file.OriginalName,
                    durationSeconds = best.file.DurationSeconds,
                    avgRating = best.avg
                });
            }
            return Results.Ok(result);
        });

        return app;
    }
}
