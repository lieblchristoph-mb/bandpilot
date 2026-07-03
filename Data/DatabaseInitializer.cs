using Microsoft.EntityFrameworkCore;
using WebPush;
using BandKalender.Models;

namespace BandKalender.Data;

public static class DatabaseInitializer
{
    public static void Initialize(AppDbContext db, string webRootPath)
    {
        db.Database.EnsureCreated();

        try { db.Database.ExecuteSqlRaw("ALTER TABLE Members ADD COLUMN PasswordHash TEXT"); } catch { }
        try { db.Database.ExecuteSqlRaw("ALTER TABLE Members ADD COLUMN IsAdmin INTEGER NOT NULL DEFAULT 0"); } catch { }
        try { db.Database.ExecuteSqlRaw("ALTER TABLE Members ADD COLUMN LastLogin TEXT"); } catch { }

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS BandEvents (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Date TEXT NOT NULL UNIQUE,
                Note TEXT
            )
            """);

        db.Database.ExecuteSqlRaw("UPDATE Members SET IsAdmin = 1 WHERE Name IN ('Toffl', 'Admin')");

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS PushSubs (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                MemberId INTEGER NOT NULL,
                Endpoint TEXT NOT NULL,
                P256dh TEXT NOT NULL,
                Auth TEXT NOT NULL
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS AppConfig (
                Key TEXT PRIMARY KEY,
                Value TEXT NOT NULL
            )
            """);

        var newKeys = VapidHelper.GenerateVapidKeys();
        db.Database.ExecuteSqlRaw($"INSERT OR IGNORE INTO AppConfig(Key,Value) VALUES('VapidPublic','{newKeys.PublicKey}')");
        db.Database.ExecuteSqlRaw($"INSERT OR IGNORE INTO AppConfig(Key,Value) VALUES('VapidPrivate','{newKeys.PrivateKey}')");
        db.Database.ExecuteSqlRaw($"INSERT OR IGNORE INTO AppConfig(Key,Value) VALUES('VapidSubject','mailto:liebl.christoph@web.de')");

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS Sessions (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Token TEXT NOT NULL UNIQUE,
                MemberId INTEGER NOT NULL
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS Songs (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Title TEXT NOT NULL,
                Notes TEXT
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS SongFiles (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SongId INTEGER NOT NULL,
                FileName TEXT NOT NULL,
                OriginalName TEXT NOT NULL,
                FileSize INTEGER NOT NULL DEFAULT 0,
                DurationSeconds REAL
            )
            """);

        try { db.Database.ExecuteSqlRaw("ALTER TABLE SongFiles ADD COLUMN DurationSeconds REAL"); } catch { }
        try { db.Database.ExecuteSqlRaw("ALTER TABLE Songs ADD COLUMN IsCover INTEGER NOT NULL DEFAULT 0"); } catch { }
        try { db.Database.ExecuteSqlRaw("ALTER TABLE Songs ADD COLUMN Category TEXT NOT NULL DEFAULT 'own'"); } catch { }

        db.Database.ExecuteSqlRaw("UPDATE Songs SET Category = 'cover' WHERE IsCover = 1 AND Category = 'own'");

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS SongRatings (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SongId INTEGER NOT NULL,
                MemberId INTEGER NOT NULL,
                Stars INTEGER NOT NULL,
                Note TEXT,
                UNIQUE(SongId, MemberId)
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS Setlists (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Name TEXT NOT NULL,
                ConcertDate TEXT,
                Notes TEXT
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS SetlistSongs (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SetlistId INTEGER NOT NULL,
                SongId INTEGER NOT NULL,
                Position INTEGER NOT NULL DEFAULT 0
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS SetlistRatings (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SetlistId INTEGER NOT NULL,
                MemberId INTEGER NOT NULL,
                Stars INTEGER NOT NULL,
                Note TEXT,
                UNIQUE(SetlistId, MemberId)
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS FileRatings (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SongFileId INTEGER NOT NULL,
                MemberId INTEGER NOT NULL,
                Stars INTEGER NOT NULL,
                Note TEXT,
                UNIQUE(SongFileId, MemberId)
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS TodoColumns (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Name TEXT NOT NULL,
                Position INTEGER NOT NULL DEFAULT 0
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS TodoCards (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                ColumnId INTEGER NOT NULL,
                Title TEXT NOT NULL,
                Description TEXT,
                Position INTEGER NOT NULL DEFAULT 0
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS TodoCardAssignees (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                CardId INTEGER NOT NULL,
                MemberId INTEGER NOT NULL,
                UNIQUE(CardId, MemberId)
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS TodoCheckItems (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                CardId INTEGER NOT NULL,
                Text TEXT NOT NULL,
                IsDone INTEGER NOT NULL DEFAULT 0,
                Position INTEGER NOT NULL DEFAULT 0
            )
            """);

        try { db.Database.ExecuteSqlRaw("ALTER TABLE TodoCards ADD COLUMN DueDate TEXT"); } catch { }

        if (!db.TodoColumns.Any())
        {
            db.TodoColumns.AddRange(
                new TodoColumn { Name = "Offen", Position = 1 },
                new TodoColumn { Name = "In Bearbeitung", Position = 2 },
                new TodoColumn { Name = "Erledigt", Position = 3 }
            );
            db.SaveChanges();
        }

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS FinanceEvents (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Name TEXT NOT NULL,
                Date TEXT,
                Description TEXT,
                CreatedAt TEXT NOT NULL DEFAULT ''
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS FinanceExpenses (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                EventId INTEGER NOT NULL,
                MemberId INTEGER NOT NULL,
                Amount REAL NOT NULL,
                Description TEXT NOT NULL DEFAULT '',
                ReceiptFileName TEXT,
                ReceiptOriginalName TEXT,
                CreatedAt TEXT NOT NULL DEFAULT ''
            )
            """);

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS FinanceIncomes (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                EventId INTEGER NOT NULL,
                Amount REAL NOT NULL,
                Description TEXT NOT NULL DEFAULT '',
                CreatedAt TEXT NOT NULL DEFAULT ''
            )
            """);

        try { db.Database.ExecuteSqlRaw("ALTER TABLE FinanceEvents ADD COLUMN BandkasseAmount REAL NOT NULL DEFAULT 0"); } catch { }
        try { db.Database.ExecuteSqlRaw("ALTER TABLE BandEvents ADD COLUMN Time TEXT"); } catch { }
        try { db.Database.ExecuteSqlRaw("ALTER TABLE Members ADD COLUMN DisplayName TEXT"); } catch { }
        // One-time: move real name to DisplayName, restore band alias as Name
        db.Database.ExecuteSqlRaw("UPDATE Members SET DisplayName = Name, Name = 'Toffl' WHERE Name = 'Christoph'"
        );

        db.Database.ExecuteSqlRaw("""
            CREATE TABLE IF NOT EXISTS MemberPresences (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                MemberId INTEGER NOT NULL,
                Page TEXT NOT NULL,
                LastSeenAt TEXT NOT NULL DEFAULT '',
                UNIQUE(MemberId, Page)
            )
            """);

        Directory.CreateDirectory(Path.Combine(webRootPath, "uploads", "songs"));
        Directory.CreateDirectory(Path.Combine(webRootPath, "uploads", "receipts"));
    }
}
