namespace BandKalender.Models;

public class FinanceEvent
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Date { get; set; }
    public string? Description { get; set; }
    public string CreatedAt { get; set; } = "";
    public decimal BandkasseAmount { get; set; }
}
