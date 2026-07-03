using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using BandKalender.Data;
using BandKalender.Models;
using BandKalender.Services;

namespace BandKalender.Endpoints;

public static class TodoEndpoints
{
    public static IEndpointRouteBuilder MapTodoEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/todo/columns", async (AppDbContext db) =>
        {
            var cols = await db.TodoColumns.OrderBy(c => c.Position).ToListAsync();
            var cards = await db.TodoCards.OrderBy(c => c.Position).ToListAsync();
            var assignees = await db.TodoCardAssignees.ToListAsync();
            var checks = await db.TodoCheckItems.ToListAsync();
            return Results.Ok(cols.Select(col => new
            {
                col.Id, col.Name, col.Position,
                cards = cards.Where(c => c.ColumnId == col.Id).Select(c => new
                {
                    c.Id, c.ColumnId, c.Title, c.Position,
                    assigneeMemberIds = assignees.Where(a => a.CardId == c.Id).Select(a => a.MemberId).ToList(),
                    checkTotal = checks.Count(i => i.CardId == c.Id),
                    checkDone = checks.Count(i => i.CardId == c.Id && i.IsDone),
                    c.DueDate
                }).ToList()
            }));
        });

        app.MapPost("/api/todo/columns", async (AppDbContext db, TodoColumnDto dto) =>
        {
            var name = (dto.Name ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { error = "Name fehlt" });
            var maxPos = await db.TodoColumns.MaxAsync(c => (int?)c.Position) ?? 0;
            var col = new TodoColumn { Name = name, Position = maxPos + 1 };
            db.TodoColumns.Add(col);
            await db.SaveChangesAsync();
            return Results.Ok(col);
        });

        app.MapPut("/api/todo/columns/{id:int}", async (AppDbContext db, int id, TodoColumnDto dto) =>
        {
            var col = await db.TodoColumns.FindAsync(id);
            if (col is null) return Results.NotFound();
            var name = (dto.Name ?? "").Trim();
            if (string.IsNullOrWhiteSpace(name)) return Results.BadRequest(new { error = "Name fehlt" });
            col.Name = name;
            await db.SaveChangesAsync();
            return Results.Ok(col);
        });

        app.MapDelete("/api/todo/columns/{id:int}", async (AppDbContext db, int id) =>
        {
            var col = await db.TodoColumns.FindAsync(id);
            if (col is null) return Results.NotFound();
            var cardIds = await db.TodoCards.Where(c => c.ColumnId == id).Select(c => c.Id).ToListAsync();
            db.TodoCardAssignees.RemoveRange(db.TodoCardAssignees.Where(a => cardIds.Contains(a.CardId)));
            db.TodoCheckItems.RemoveRange(db.TodoCheckItems.Where(i => cardIds.Contains(i.CardId)));
            db.TodoCards.RemoveRange(db.TodoCards.Where(c => c.ColumnId == id));
            db.TodoColumns.Remove(col);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        app.MapGet("/api/todo/cards/{id:int}", async (AppDbContext db, int id) =>
        {
            var card = await db.TodoCards.FindAsync(id);
            if (card is null) return Results.NotFound();
            var assignees = await db.TodoCardAssignees.Where(a => a.CardId == id).Select(a => a.MemberId).ToListAsync();
            var checks = await db.TodoCheckItems.Where(i => i.CardId == id).OrderBy(i => i.Position).ToListAsync();
            return Results.Ok(new
            {
                card.Id, card.ColumnId, card.Title, card.Description, card.Position, card.DueDate,
                assigneeMemberIds = assignees,
                checkItems = checks.Select(i => new { i.Id, i.Text, i.IsDone, i.Position })
            });
        });

        app.MapPost("/api/todo/cards", async (AppDbContext db, TodoCardCreateDto dto) =>
        {
            if (await db.TodoColumns.FindAsync(dto.ColumnId) is null) return Results.NotFound();
            var title = (dto.Title ?? "").Trim();
            if (string.IsNullOrWhiteSpace(title)) return Results.BadRequest(new { error = "Titel fehlt" });
            var maxPos = await db.TodoCards.Where(c => c.ColumnId == dto.ColumnId).MaxAsync(c => (int?)c.Position) ?? 0;
            var card = new TodoCard { ColumnId = dto.ColumnId, Title = title, Position = maxPos + 1 };
            db.TodoCards.Add(card);
            await db.SaveChangesAsync();
            return Results.Ok(card);
        });

        app.MapPut("/api/todo/cards/{id:int}", async (AppDbContext db, int id, TodoCardUpdateDto dto) =>
        {
            var card = await db.TodoCards.FindAsync(id);
            if (card is null) return Results.NotFound();
            if (!string.IsNullOrWhiteSpace(dto.Title)) card.Title = dto.Title.Trim();
            if (dto.Description is not null) card.Description = dto.Description.Trim() == "" ? null : dto.Description.Trim();
            if (dto.DueDate is not null) card.DueDate = dto.DueDate.Trim() == "" ? null : dto.DueDate.Trim();
            if (dto.ColumnId.HasValue && dto.ColumnId.Value != card.ColumnId)
            {
                card.ColumnId = dto.ColumnId.Value;
                var maxPos = await db.TodoCards.Where(c => c.ColumnId == dto.ColumnId.Value && c.Id != id).MaxAsync(c => (int?)c.Position) ?? 0;
                card.Position = maxPos + 1;
            }
            await db.SaveChangesAsync();
            return Results.Ok(card);
        });

        app.MapDelete("/api/todo/cards/{id:int}", async (AppDbContext db, int id) =>
        {
            var card = await db.TodoCards.FindAsync(id);
            if (card is null) return Results.NotFound();
            db.TodoCardAssignees.RemoveRange(db.TodoCardAssignees.Where(a => a.CardId == id));
            db.TodoCheckItems.RemoveRange(db.TodoCheckItems.Where(i => i.CardId == id));
            db.TodoCards.Remove(card);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        app.MapPut("/api/todo/cards/{id:int}/assignees", async (HttpContext ctx, AppDbContext db, IServiceScopeFactory scopeFactory, int id, AssigneesDto dto) =>
        {
            var card = await db.TodoCards.FindAsync(id);
            if (card is null) return Results.NotFound();
            var callerId = (int)ctx.Items["memberId"]!;
            var oldAssignees = await db.TodoCardAssignees.Where(a => a.CardId == id).Select(a => a.MemberId).ToListAsync();
            var newAssignees = dto.MemberIds ?? new List<int>();
            var newlyAdded = newAssignees.Where(mid => !oldAssignees.Contains(mid) && mid != callerId).ToList();
            db.TodoCardAssignees.RemoveRange(db.TodoCardAssignees.Where(a => a.CardId == id));
            foreach (var mid in newAssignees)
                db.TodoCardAssignees.Add(new TodoCardAssignee { CardId = id, MemberId = mid });
            await db.SaveChangesAsync();

            if (newlyAdded.Any())
            {
                var callerName = (await db.Members.FindAsync(callerId))?.Name ?? "?";
                var capturedNew = newlyAdded;
                PushService.FireAndForget(
                    scopeFactory,
                    sdb => sdb.PushSubs.Where(s => capturedNew.Contains(s.MemberId)).ToListAsync(),
                    JsonSerializer.Serialize(new { title = "The Dead App Notes", body = $"{callerName} hat dich zu \"{card.Title}\" zugewiesen" }));
            }

            return Results.Ok();
        });

        app.MapPost("/api/todo/cards/{id:int}/checklist", async (AppDbContext db, int id, CheckItemDto dto) =>
        {
            if (await db.TodoCards.FindAsync(id) is null) return Results.NotFound();
            var text = (dto.Text ?? "").Trim();
            if (string.IsNullOrWhiteSpace(text)) return Results.BadRequest(new { error = "Text fehlt" });
            var maxPos = await db.TodoCheckItems.Where(i => i.CardId == id).MaxAsync(i => (int?)i.Position) ?? 0;
            var item = new TodoCheckItem { CardId = id, Text = text, Position = maxPos + 1 };
            db.TodoCheckItems.Add(item);
            await db.SaveChangesAsync();
            return Results.Ok(item);
        });

        app.MapPut("/api/todo/cards/{id:int}/checklist/{itemId:int}", async (AppDbContext db, int id, int itemId, CheckItemUpdateDto dto) =>
        {
            var item = await db.TodoCheckItems.FirstOrDefaultAsync(i => i.Id == itemId && i.CardId == id);
            if (item is null) return Results.NotFound();
            if (dto.Text is not null && dto.Text.Trim() != "") item.Text = dto.Text.Trim();
            if (dto.IsDone.HasValue) item.IsDone = dto.IsDone.Value;
            await db.SaveChangesAsync();
            return Results.Ok(item);
        });

        app.MapDelete("/api/todo/cards/{id:int}/checklist/{itemId:int}", async (AppDbContext db, int id, int itemId) =>
        {
            var item = await db.TodoCheckItems.FirstOrDefaultAsync(i => i.Id == itemId && i.CardId == id);
            if (item is null) return Results.NotFound();
            db.TodoCheckItems.Remove(item);
            await db.SaveChangesAsync();
            return Results.Ok();
        });

        app.MapGet("/api/todo/calendar", async (AppDbContext db, string month) =>
        {
            var cards = await db.TodoCards
                .Where(c => c.DueDate != null && c.DueDate.StartsWith(month))
                .ToListAsync();
            return Results.Ok(cards.Select(c => new { c.Id, c.Title, c.DueDate }));
        });

        return app;
    }
}
