using Avalonia;
using Avalonia.Controls;

namespace Elevateo.Windows.Views;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        SizeChanged += (_, _) => UpdateLayoutForWidth();
        Opened += (_, _) => UpdateLayoutForWidth();
    }

    private void UpdateLayoutForWidth()
    {
        // AIDEV-NOTE: the 1280px threshold reserves 400px for the reader alongside both navigation panes.
        var wide = Bounds.Width >= 1280;
        MailLayout.ColumnDefinitions[3].Width = new GridLength(wide ? 320 : 0);
        AssistantPane.IsVisible = wide;
    }
}
