using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.Multiview;

public sealed class PluginConfiguration : BasePluginConfiguration { }

public sealed class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public Plugin(IApplicationPaths paths, IXmlSerializer serializer) : base(paths, serializer) { }
    public override string Name => "Multiview";
    public override string Description => "Independent sports stream viewports for Jellyfin Web.";
    public override Guid Id => Guid.Parse("9a08a8b3-3078-4b69-bc84-290ef5db4938");
    public IEnumerable<PluginPageInfo> GetPages() =>
    [
        new PluginPageInfo
        {
            Name = "multiview",
            EmbeddedResourcePath = "Jellyfin.Plugin.Multiview.Configuration.configPage.html"
        }
    ];
}
