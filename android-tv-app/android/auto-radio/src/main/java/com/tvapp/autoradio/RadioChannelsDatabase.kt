package com.tvapp.autoradio

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [RadioChannelEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class RadioChannelsDatabase : RoomDatabase() {
    abstract fun radioChannelDao(): RadioChannelDao

    companion object {
        private const val DATABASE_NAME = "radio_channels_room.db"
        private const val DATABASE_ASSET_PATH = "databases/radio_channels.db"

        @Volatile
        private var instance: RadioChannelsDatabase? = null

        fun getInstance(context: Context): RadioChannelsDatabase {
            return instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    RadioChannelsDatabase::class.java,
                    DATABASE_NAME,
                )
                    .createFromAsset(DATABASE_ASSET_PATH)
                    .build()
                    .also { instance = it }
            }
        }
    }
}
