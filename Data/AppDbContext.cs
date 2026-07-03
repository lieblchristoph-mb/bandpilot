using Microsoft.EntityFrameworkCore;
using BandKalender.Models;

namespace BandKalender.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Member> Members => Set<Member>();
    public DbSet<AvailabilityEntry> Availability => Set<AvailabilityEntry>();
    public DbSet<Session> Sessions => Set<Session>();
    public DbSet<Song> Songs => Set<Song>();
    public DbSet<SongFile> SongFiles => Set<SongFile>();
    public DbSet<SongRating> SongRatings => Set<SongRating>();
    public DbSet<Setlist> Setlists => Set<Setlist>();
    public DbSet<SetlistSong> SetlistSongs => Set<SetlistSong>();
    public DbSet<SetlistRating> SetlistRatings => Set<SetlistRating>();
    public DbSet<FileRating> FileRatings => Set<FileRating>();
    public DbSet<PushSub> PushSubs => Set<PushSub>();
    public DbSet<BandEvent> BandEvents => Set<BandEvent>();
    public DbSet<TodoColumn> TodoColumns => Set<TodoColumn>();
    public DbSet<TodoCard> TodoCards => Set<TodoCard>();
    public DbSet<TodoCardAssignee> TodoCardAssignees => Set<TodoCardAssignee>();
    public DbSet<TodoCheckItem> TodoCheckItems => Set<TodoCheckItem>();
    public DbSet<FinanceEvent> FinanceEvents => Set<FinanceEvent>();
    public DbSet<FinanceExpense> FinanceExpenses => Set<FinanceExpense>();
    public DbSet<FinanceIncome> FinanceIncomes => Set<FinanceIncome>();
    public DbSet<MemberPresence> MemberPresences => Set<MemberPresence>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<AvailabilityEntry>()
            .HasIndex(e => new { e.MemberId, e.Date })
            .IsUnique();

        b.Entity<Session>()
            .HasIndex(s => s.Token)
            .IsUnique();

        b.Entity<SongRating>()
            .HasIndex(r => new { r.SongId, r.MemberId })
            .IsUnique();

        b.Entity<SetlistRating>()
            .HasIndex(r => new { r.SetlistId, r.MemberId })
            .IsUnique();

        b.Entity<FileRating>()
            .HasIndex(r => new { r.SongFileId, r.MemberId })
            .IsUnique();
    }
}
