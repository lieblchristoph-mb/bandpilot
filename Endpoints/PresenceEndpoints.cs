using Microsoft.EntityFrameworkCore;
using BandKalender.Data;
using BandKalender.Models;

namespace BandKalender.Endpoints;

public static class PresenceEndpoints
{
    static readonly HashSet<string> ValidPages = ["kalender", "songs", "setlists", "todos", "finanzen"];

    public static IEndpointRouteBuilder MapPresenceEndpoints(this IEndpointRouteBuilder app)
    {
        // POST /api/presence – upsert current member's presence, return all presences for that page
        app.MapPost("/api/presence", async (HttpContext ctx, AppDbContext db, PresenceDto dto) =>
        {
            if (!ValidPages.Contains(dto.Page ?? "")) return Results.BadRequest();
            var memberId = (int)ctx.Items["memberId"]!;
            var existing = await db.MemberPresences
                .FirstOrDefaultAsync(p => p.MemberId == memberId && p.Page == dto.Page);
            if (existing is null)
                db.MemberPresences.Add(new MemberPresence { MemberId = memberId, Page = dto.Page!, LastSeenAt = DateTime.UtcNow });
            else
                existing.LastSeenAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            var list = await db.MemberPresences
                .Where(p => p.Page == dto.Page)
                .OrderByDescending(p => p.LastSeenAt)
                .Select(p => new { p.MemberId, memberName = p.Member.Name, memberColor = p.Member.Color, lastSeenAt = p.LastSeenAt })
                .ToListAsync();
            return Results.Ok(list);
        });

        // GET /api/presence – all presences (for admin overview)
        app.MapGet("/api/presence", async (AppDbContext db) =>
        {
            var list = await db.MemberPresences
                .OrderByDescending(p => p.LastSeenAt)
                .Select(p => new { p.MemberId, memberName = p.Member.Name, memberColor = p.Member.Color, p.Page, lastSeenAt = p.LastSeenAt })
                .ToListAsync();
            return Results.Ok(list);
        });

        return app;
    }
}

record PresenceDto(string? Page);
