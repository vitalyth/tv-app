package com.tvapp.autoradio

data class RadioStation(
    val id: String,
    val name: String,
    val logo: String?,
    val streamUrl: String? = null,
    val mimeType: String? = null,
    val group: String = "israelis",
)
