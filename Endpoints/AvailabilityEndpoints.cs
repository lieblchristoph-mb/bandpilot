using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using BandKalender.Data;
using BandKalender.Models;
using BandKalender.Services;

namespace BandKalender.Endpoints;

public static class AvailabilityEndpoints
{
    public static IEndpointRouteBuilder MapAvailabilityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/availability", async (AppDbContext db, string month) =>
        {
            if (string.IsNullOrWhiteSpace(month)) return Results.BadRequest(new { error = "month fehlt" });
            return Results.Ok(await db.Availability.Where(e => e.Date.StartsWith(month)).ToListAsync());
        });

        app.MapGet("/api/availability/perfect", async (AppDbContext db) =>
        {
            var memberCount = await db.Members.CountAsync();
            if (memberCount == 0) return Results.Ok(Array.Empty<string>());
            var all = await db.Availability.Where(e => e.Status == "available").ToListAsync();
            var perfectDates = all
                .GroupBy(e => e.Date)
                .Where(g => g.Select(e => e.MemberId).Distinct().Count() == memberCount)
                .Select(g => g.Key)
                .OrderBy(d => d)
                .ToList();
            return Results.Ok(perfectDates);
        });

        app.MapPut("/api/availability", async (HttpContext ctx, AppDbContext db, IServiceScopeFactory scopeFactory, AvailabilityDto dto) =>
        {
            var loggedInId = (int)ctx.Items["memberId"]!;
            if (dto.MemberId != loggedInId)
                return Results.Json(new { error = "forbidden" }, statusCode: StatusCodes.Status403Forbidden);
            if (string.IsNullOrWhiteSpace(dto.Date))
                return Results.BadRequest(new { error = "date fehlt" });

            var existing = await db.Availability.FirstOrDefaultAsync(e => e.MemberId == dto.MemberId && e.Date == dto.Date);
            if (dto.Status == "clear")
            {
                if (existing is not null) { db.Availability.Remove(existing); await db.SaveChangesAsync(); }
                return Results.Ok();
            }
            if (existing is null) { existing = new AvailabilityEntry { MemberId = dto.MemberId, Date = dto.Date }; db.Availability.Add(existing); }
            existing.Status = dto.Status;
            existing.Note = dto.Note;
            await db.SaveChangesAsync();

            var memberName = (await db.Members.FindAsync(loggedInId))?.Name ?? "?";
            var parts = dto.Date.Split('-');
            var dateStr = parts.Length == 3 ? $"{parts[2]}.{parts[1]}.{parts[0]}" : dto.Date;
            var statusLabel = dto.Status == "available" ? "✅ frei" : dto.Status == "maybe" ? "🟡 vielleicht" : "❌ keine Zeit";
            var body = $"{memberName} ist am {dateStr} {statusLabel}";
            if (!string.IsNullOrWhiteSpace(dto.Note)) body += $" – {dto.Note}";
            var capturedId = loggedInId;
            PushService.FireAndForget(
                scopeFactory,
                sdb => sdb.PushSubs.Where(s => s.MemberId != capturedId).ToListAsync(),
                JsonSerializer.Serialize(new { title = "The Dead App Notes", body }));

            return Results.Ok(existing);
        });

        return app;
    }
}
