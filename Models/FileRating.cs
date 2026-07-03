namespace BandKalender.Models;

public class FileRating
{
    public int Id { get; set; }
    public int SongFileId { get; set; }
    public int MemberId { get; set; }
    public int Stars { get; set; }
    public string? Note { get; set; }
}
