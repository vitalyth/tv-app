import xbmcplugin

def get_stream(channel):
    moreData = '1'

    moduleScript = __import__(
        f'resources.lib.{channel.module}',
        fromlist=[channel.module]
    )

    moduleScript.Run(
        channel.name,
        channel.channelID,
        channel.mode,
        '',
        moreData
    )

    return xbmcplugin.getStream()