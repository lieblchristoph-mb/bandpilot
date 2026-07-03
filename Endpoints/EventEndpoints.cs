using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using BandKalender.Data;
using BandKalender.Models;
using BandKalender.Services;

namespace BandKalender.Endpoints;

public static class EventEndpoints
{
    public static IEndpointRouteBuilder MapEventEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/events", async (AppDbContext db, string? month) =>
        {
            var events = string.IsNullOrEmpty(month)
                ? await db.BandEvents.ToListAsync()
                : await db.BandEvents.Where(e => e.Date.StartsWith(month)).ToListAsync();
            return Results.Ok(events.Select(e => new { e.Id, e.Date, e.Note, e.Time }));
        });

        app.MapPost("/api/events", async (HttpContext ctx, AppDbContext db, IServiceScopeFactory scopeFactory, BandEventDto dto) =>
        {
            var callerId = (int)ctx.Items["memberId"]!;
            var date = (dto.Date ?? "").Trim();
            if (string.IsNullOrEmpty(date)) return Results.BadRequest(new { error = "Datum fehlt" });

            var time = string.IsNullOrWhiteSpace(dto.Time) ? null : dto.Time.Trim();

            var existing = await db.BandEvents.FirstOrDefaultAsync(e => e.Date == date);
            if (existing is not null)
            {
                existing.Note = dto.Note?.Trim();
                existing.Time = time;
            }
            else
            {
                db.BandEvents.Add(new BandEvent { Date = date, Note = dto.Note?.Trim(), Time = time });
            }
            await db.SaveChangesAsync();

            var parts = date.Split('-');
            var dateStr = parts.Length == 3 ? $"{parts[2]}.{parts[1]}.{parts[0]}" : date;
            var body = $"Bandprobe am {dateStr}";
            if (time is not null) body += $" um {time} Uhr";
            if (!string.IsNullOrEmpty(dto.Note?.Trim())) body += $" – {dto.Note!.Trim()}";
            body += "\nTippe für Kalender-Export";
            var capturedId = callerId;
            PushService.FireAndForget(
                scopeFactory,
                sdb => sdb.PushSubs.Where(s => s.MemberId != capturedId).ToListAsync(),
                JsonSerializer.Serialize(new { title = "🎸 Bandprobe!", body, url = $"/api/events/{date}/ics" }));

            return Results.Ok();
        });

        app.MapDelete("/api/events/{date}", async (AppDbContext db, string date) =>
        {
            var ev = await db.BandEvents.FirstOrDefaultAsync(e => e.Date == date);
            if (ev is not null) { db.BandEvents.Remove(ev); await db.SaveChangesAsync(); }
            return Results.Ok();
        });

        app.MapGet("/api/events/{date}/ics", async (AppDbContext db, string date) =>
        {
            var ev = await db.BandEvents.FirstOrDefaultAsync(e => e.Date == date);
            var summary = ev is not null && !string.IsNullOrEmpty(ev.Note) ? $"Bandprobe – {ev.Note}" : "Bandprobe";

            string dtStart, dtEnd;
            if (ev?.Time is not null && TimeSpan.TryParse(ev.Time, out var t))
            {
                var d = DateTime.Parse(date).Add(t);
                var dEnd = d.AddHours(2);
                dtStart = d.ToString("yyyyMMdd'T'HHmmss");
                dtEnd = dEnd.ToString("yyyyMMdd'T'HHmmss");
            }
            else
            {
                dtStart = date.Replace("-", "");
                dtEnd = DateTime.Parse(date).AddDays(1).ToString("yyyyMMdd");
            }

            var useDateValue = ev?.Time is null;
            var dtStartLine = useDateValue ? $"DTSTART;VALUE=DATE:{dtStart}" : $"DTSTART:{dtStart}";
            var dtEndLine = useDateValue ? $"DTEND;VALUE=DATE:{dtEnd}" : $"DTEND:{dtEnd}";

            var ics = $"""
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//The Dead App Notes//DE
BEGIN:VEVENT
UID:bandprobe-{date}@thedeadnotesapp.duckdns.org
{dtStartLine}
{dtEndLine}
SUMMARY:{summary}
END:VEVENT
END:VCALENDAR
""";
            return Results.Text(ics, "text/calendar", System.Text.Encoding.UTF8);
        });

        return app;
    }
}
