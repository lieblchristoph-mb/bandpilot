namespace BandKalender.Models;

public class TodoCheckItem
{
    public int Id { get; set; }
    public int CardId { get; set; }
    public string Text { get; set; } = "";
    public bool IsDone { get; set; }
    public int Position { get; set; }
}
