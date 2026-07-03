namespace BandKalender.Models;

public class FinanceIncome
{
    public int Id { get; set; }
    public int EventId { get; set; }
    public decimal Amount { get; set; }
    public string Description { get; set; } = "";
    public string CreatedAt { get; set; } = "";
}
