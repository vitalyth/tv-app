import xbmcplugin

def get_stream(channel):
    xbmcplugin.clearStream()

    moduleScript = __import__(
        f'resources.lib.{channel.module}',
        fromlist=[channel.module]
    )

    moduleScript.Run(
        channel.name,
        channel.channelID,
        channel.mode,
        '',
        '1'
    )

    return xbmcplugin.getStream()
