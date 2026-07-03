using Microsoft.EntityFrameworkCore;
using BandKalender.Data;
using BandKalender.Models;
using BandKalender.Services;

namespace BandKalender.Endpoints;

public static class PushEndpoints
{
    public static IEndpointRouteBuilder MapPushEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/push/vapidkey", async (AppDbContext db) =>
        {
            var key = db.Database.SqlQuery<string>($"SELECT Value FROM AppConfig WHERE Key = 'VapidPublic'").FirstOrDefault();
            return key is null ? Results.NotFound() : Results.Ok(new { publicKey = key });
        });

        app.MapPost("/api/push/subscribe", async (HttpContext ctx, AppDbContext db, PushSubDto dto) =>
        {
            var memberId = (int)ctx.Items["memberId"]!;
            // Ein Endpoint gehört immer nur einem Mitglied – alte Einträge anderer Member entfernen
            var stale = await db.PushSubs.Where(s => s.Endpoint == dto.Endpoint && s.MemberId != memberId).ToListAsync();
            db.PushSubs.RemoveRange(stale);
            var existing = await db.PushSubs.FirstOrDefaultAsync(s => s.MemberId == memberId && s.Endpoint == dto.Endpoint);
            if (existing is null) { db.PushSubs.Add(new PushSub { MemberId = memberId, Endpoint = dto.Endpoint, P256dh = dto.P256dh, Auth = dto.Auth }); }
            else { existing.P256dh = dto.P256dh; existing.Auth = dto.Auth; }
            await db.SaveChangesAsync();
            return Results.Ok();
        });

return app;
    }
}
