using Avalonia;
using Avalonia.Controls;
using Avalonia.Headless;
using Avalonia.Headless.XUnit;
using Avalonia.Threading;
using Elevateo.Windows.Views;
using Xunit;

[assembly: AvaloniaTestApplication(typeof(Elevateo.Client.Core.Tests.HeadlessApplication))]

namespace Elevateo.Client.Core.Tests;

public static class HeadlessApplication
{
    public static AppBuilder BuildAvaloniaApp() => AppBuilder.Configure<Elevateo.Windows.App>()
        .UseHeadless(new AvaloniaHeadlessPlatformOptions { UseHeadlessDrawing = false }).UseSkia();
}

public sealed class WindowLayoutTests
{
    [AvaloniaTheory]
    [InlineData(960, false)]
    [InlineData(1280, true)]
    public void ReaderRemainsUsableAndSimulationBannerVisible(int width, bool assistantVisible)
    {
        using var vm = MainViewModelTests.Create(new ViewModelApi());
        vm.IsSignedIn = true;
        vm.SimulationMode = true;
        vm.SelectedMailbox = MainViewModelTests.Mailbox("Inbox");
        vm.SelectedThread = MainViewModelTests.Row("Example conversation");
        var window = new MainWindow { DataContext = vm, Width = width, Height = 800 };
        window.Show();
        Dispatcher.UIThread.RunJobs();
        Assert.True(window.FindControl<Grid>("ReaderPane")!.Bounds.Width >= 400);
        Assert.Equal(assistantVisible, window.FindControl<Border>("AssistantPane")!.IsVisible);
        Assert.True(window.FindControl<TextBlock>("SimulationBanner")!.IsVisible);
        var evidence = Environment.GetEnvironmentVariable("ELEVATEO_VISUAL_EVIDENCE");
        if (evidence is not null)
        {
            Directory.CreateDirectory(evidence);
            using var frame = window.CaptureRenderedFrame();
            Assert.NotNull(frame);
            frame.Save(Path.Combine(evidence, $"windows-{width}.png"));
        }
        window.Close();
    }
}
