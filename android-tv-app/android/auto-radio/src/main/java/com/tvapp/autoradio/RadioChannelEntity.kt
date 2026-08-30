package com.tvapp.autoradio

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "radio_channels",
    indices = [Index(value = ["group_name"], name = "idx_radio_channels_group_name")],
)
data class RadioChannelEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String,
    @ColumnInfo(name = "name")
    val name: String,
    @ColumnInfo(name = "type")
    val type: String?,
    @ColumnInfo(name = "logo")
    val logo: String?,
    @ColumnInfo(name = "stream_url")
    val streamUrl: String?,
    @ColumnInfo(name = "mime_type")
    val mimeType: String?,
    @ColumnInfo(name = "group_name")
    val groupName: String?,
)
