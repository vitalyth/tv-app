package com.tvapp.autoradio

import androidx.room.Dao
import androidx.room.Query

@Dao
interface RadioChannelDao {
    @Query(
        """
        SELECT id, name, type, logo, stream_url, mime_type, group_name
        FROM radio_channels
        WHERE type IS NULL OR type = 'radio'
        ORDER BY name COLLATE NOCASE ASC
        """,
    )
    fun getRadioChannels(): List<RadioChannelEntity>
}
