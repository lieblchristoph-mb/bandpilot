using Microsoft.EntityFrameworkCore;
using BandKalender.Data;
using BandKalender.Helpers;

namespace BandKalender.Endpoints;

public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/admin/users", async (HttpContext ctx, AppDbContext db) =>
        {
            var callerId = (int)ctx.Items["memberId"]!;
            var caller = await db.Members.FindAsync(callerId);
            if (caller is null || !caller.IsAdmin)
                return Results.Json(new { error = "Nur Admins." }, statusCode: StatusCodes.Status403Forbidden);

            var users = await db.Members.OrderBy(m => m.Id)
                .Select(m => new { m.Id, m.Name, m.DisplayName, m.Color, m.IsAdmin, m.LastLogin })
                .ToListAsync();
            return Results.Ok(users);
        });

        app.MapPut("/api/admin/users/{id:int}", async (HttpContext ctx, AppDbContext db, int id, MemberAdminUpdateDto dto) =>
        {
            var callerId = (int)ctx.Items["memberId"]!;
            var caller = await db.Members.FindAsync(callerId);
            if (caller is null || !caller.IsAdmin)
                return Results.Json(new { error = "Nur Admins." }, statusCode: StatusCodes.Status403Forbidden);

            var member = await db.Members.FindAsync(id);
            if (member is null) return Results.NotFound();

            if (!string.IsNullOrWhiteSpace(dto.Name)) member.Name = dto.Name.Trim();
            if (!string.IsNullOrWhiteSpace(dto.Color)) member.Color = dto.Color.Trim();
            if (!string.IsNullOrWhiteSpace(dto.Password)) member.PasswordHash = PasswordHelper.Hash(dto.Password);
            member.IsAdmin = dto.IsAdmin;
            member.DisplayName = string.IsNullOrWhiteSpace(dto.DisplayName) ? null : dto.DisplayName.Trim();

            await db.SaveChangesAsync();
            return Results.Ok(new { member.Id, member.Name, member.DisplayName, member.Color, member.IsAdmin });
        });

        app.MapDelete("/api/admin/users/{id:int}", async (HttpContext ctx, AppDbContext db, int id) =>
        {
            var callerId = (int)ctx.Items["memberId"]!;
            var caller = await db.Members.FindAsync(callerId);
            if (caller is null || !caller.IsAdmin)
                return Results.Json(new { error = "Nur Admins." }, statusCode: StatusCodes.Status403Forbidden);
            if (callerId == id)
                return Results.Json(new { error = "Du kannst dich nicht selbst löschen." }, statusCode: StatusCodes.Status400BadRequest);

            var member = await db.Members.FindAsync(id);
            if (member is null) return Results.NotFound();
            db.Availability.RemoveRange(db.Availability.Where(e => e.MemberId == id));
            db.Sessions.RemoveRange(db.Sessions.Where(s => s.MemberId == id));
            db.SongRatings.RemoveRange(db.SongRatings.Where(r => r.MemberId == id));
            db.SetlistRatings.RemoveRange(db.SetlistRatings.Where(r => r.MemberId == id));
            db.Members.Remove(member);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        return app;
    }
}
