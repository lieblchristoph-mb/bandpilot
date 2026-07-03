namespace BandKalender.Models;

public class MemberPresence
{
    public int Id { get; set; }
    public int MemberId { get; set; }
    public Member Member { get; set; } = null!;
    public string Page { get; set; } = "";
    public DateTime LastSeenAt { get; set; }
}
