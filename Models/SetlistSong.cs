namespace BandKalender.Models;

public class SetlistSong
{
    public int Id { get; set; }
    public int SetlistId { get; set; }
    public int SongId { get; set; }
    public int Position { get; set; }
}
