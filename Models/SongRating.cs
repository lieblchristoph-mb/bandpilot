namespace BandKalender.Models;

public class SongRating
{
    public int Id { get; set; }
    public int SongId { get; set; }
    public int MemberId { get; set; }
    public int Stars { get; set; }
    public string? Note { get; set; }
}
