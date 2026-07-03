namespace BandKalender.Models;

public class SetlistRating
{
    public int Id { get; set; }
    public int SetlistId { get; set; }
    public int MemberId { get; set; }
    public int Stars { get; set; }
    public string? Note { get; set; }
}
