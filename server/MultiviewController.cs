using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Multiview;

[ApiController]
[Route("Multiview")]
public sealed class MultiviewController : ControllerBase
{
    // This endpoint contains only public application code. All media/library
    // requests go through Jellyfin's existing authenticated, user-scoped API.
    [HttpGet("Client.js")]
    [AllowAnonymous]
    [ResponseCache(Duration = 0, NoStore = true)]
    public IActionResult Client()
    {
        var stream = typeof(Plugin).Assembly.GetManifestResourceStream("Jellyfin.Plugin.Multiview.multiview.js");
        return stream is null ? NotFound() : File(stream, "text/javascript; charset=utf-8");
    }
}
