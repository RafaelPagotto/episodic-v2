export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type NoArgs = Record<PropertyKey, never>;

export type Database = {
  public: {
    Tables: {
      episodes: {
        Row: {
          air_date: string | null;
          created_at: string;
          episode_key: string;
          episode_number: number;
          id: number;
          last_synced_at: string | null;
          metadata: Json;
          overview: string | null;
          runtime_minutes: number | null;
          season_number: number;
          show_tmdb_id: number;
          still_path: string | null;
          title: string;
          tmdb_id: number | null;
          updated_at: string;
        };
        Insert: {
          air_date?: string | null;
          created_at?: string;
          episode_key?: never;
          episode_number: number;
          id?: never;
          last_synced_at?: string | null;
          metadata?: Json;
          overview?: string | null;
          runtime_minutes?: number | null;
          season_number: number;
          show_tmdb_id: number;
          still_path?: string | null;
          title: string;
          tmdb_id?: number | null;
          updated_at?: string;
        };
        Update: {
          air_date?: string | null;
          created_at?: string;
          episode_key?: never;
          episode_number?: number;
          id?: never;
          last_synced_at?: string | null;
          metadata?: Json;
          overview?: string | null;
          runtime_minutes?: number | null;
          season_number?: number;
          show_tmdb_id?: number;
          still_path?: string | null;
          title?: string;
          tmdb_id?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            columns: ["show_tmdb_id"];
            foreignKeyName: "episodes_show_fk";
            isOneToOne: false;
            referencedColumns: ["tmdb_id"];
            referencedRelation: "shows";
          },
          {
            columns: ["show_tmdb_id", "season_number"];
            foreignKeyName: "episodes_season_fk";
            isOneToOne: false;
            referencedColumns: ["show_tmdb_id", "season_number"];
            referencedRelation: "seasons";
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          display_name: string | null;
          id: string;
          timezone: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          display_name?: string | null;
          id?: string;
          timezone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            columns: ["id"];
            foreignKeyName: "profiles_id_fkey";
            isOneToOne: true;
            referencedColumns: ["id"];
            referencedRelation: "users";
          },
        ];
      };
      seasons: {
        Row: {
          air_date: string | null;
          created_at: string;
          episode_count: number;
          id: number;
          last_synced_at: string | null;
          metadata: Json;
          name: string;
          overview: string | null;
          poster_path: string | null;
          season_number: number;
          show_tmdb_id: number;
          tmdb_id: number | null;
          updated_at: string;
        };
        Insert: {
          air_date?: string | null;
          created_at?: string;
          episode_count?: number;
          id?: never;
          last_synced_at?: string | null;
          metadata?: Json;
          name: string;
          overview?: string | null;
          poster_path?: string | null;
          season_number: number;
          show_tmdb_id: number;
          tmdb_id?: number | null;
          updated_at?: string;
        };
        Update: {
          air_date?: string | null;
          created_at?: string;
          episode_count?: number;
          id?: never;
          last_synced_at?: string | null;
          metadata?: Json;
          name?: string;
          overview?: string | null;
          poster_path?: string | null;
          season_number?: number;
          show_tmdb_id?: number;
          tmdb_id?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            columns: ["show_tmdb_id"];
            foreignKeyName: "seasons_show_tmdb_id_fkey";
            isOneToOne: false;
            referencedColumns: ["tmdb_id"];
            referencedRelation: "shows";
          },
        ];
      };
      shows: {
        Row: {
          backdrop_path: string | null;
          created_at: string;
          first_air_date: string | null;
          genres: Json;
          last_air_date: string | null;
          last_synced_at: string | null;
          metadata: Json;
          original_language: string | null;
          original_title: string | null;
          overview: string | null;
          popularity: number | null;
          poster_path: string | null;
          title: string;
          tmdb_id: number;
          tmdb_status: string | null;
          updated_at: string;
          vote_average: number | null;
          vote_count: number | null;
        };
        Insert: {
          backdrop_path?: string | null;
          created_at?: string;
          first_air_date?: string | null;
          genres?: Json;
          last_air_date?: string | null;
          last_synced_at?: string | null;
          metadata?: Json;
          original_language?: string | null;
          original_title?: string | null;
          overview?: string | null;
          popularity?: number | null;
          poster_path?: string | null;
          title: string;
          tmdb_id: number;
          tmdb_status?: string | null;
          updated_at?: string;
          vote_average?: number | null;
          vote_count?: number | null;
        };
        Update: {
          backdrop_path?: string | null;
          created_at?: string;
          first_air_date?: string | null;
          genres?: Json;
          last_air_date?: string | null;
          last_synced_at?: string | null;
          metadata?: Json;
          original_language?: string | null;
          original_title?: string | null;
          overview?: string | null;
          popularity?: number | null;
          poster_path?: string | null;
          title?: string;
          tmdb_id?: number;
          tmdb_status?: string | null;
          updated_at?: string;
          vote_average?: number | null;
          vote_count?: number | null;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          created_at: string;
          fade_dropped: boolean;
          hide_completed: boolean;
          hide_dropped: boolean;
          library_sort: string;
          library_sort_direction: string;
          library_status_order: string[];
          search_fade_added: boolean;
          search_hide_added: boolean;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          fade_dropped?: boolean;
          hide_completed?: boolean;
          hide_dropped?: boolean;
          library_sort?: string;
          library_sort_direction?: string;
          library_status_order?: string[];
          search_fade_added?: boolean;
          search_hide_added?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          fade_dropped?: boolean;
          hide_completed?: boolean;
          hide_dropped?: boolean;
          library_sort?: string;
          library_sort_direction?: string;
          library_status_order?: string[];
          search_fade_added?: boolean;
          search_hide_added?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            columns: ["user_id"];
            foreignKeyName: "user_preferences_user_id_fkey";
            isOneToOne: true;
            referencedColumns: ["id"];
            referencedRelation: "users";
          },
        ];
      };
      user_shows: {
        Row: {
          added_at: string;
          created_at: string;
          favourite: boolean;
          id: number;
          show_tmdb_id: number;
          status: Database["public"]["Enums"]["show_watch_status"];
          status_updated_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          created_at?: string;
          favourite?: boolean;
          id?: never;
          show_tmdb_id: number;
          status?: Database["public"]["Enums"]["show_watch_status"];
          status_updated_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          created_at?: string;
          favourite?: boolean;
          id?: never;
          show_tmdb_id?: number;
          status?: Database["public"]["Enums"]["show_watch_status"];
          status_updated_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            columns: ["show_tmdb_id"];
            foreignKeyName: "user_shows_show_tmdb_id_fkey";
            isOneToOne: false;
            referencedColumns: ["tmdb_id"];
            referencedRelation: "shows";
          },
          {
            columns: ["user_id"];
            foreignKeyName: "user_shows_user_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "users";
          },
        ];
      };
      watched_episodes: {
        Row: {
          created_at: string;
          episode_key: string;
          episode_number: number;
          id: number;
          season_number: number;
          show_tmdb_id: number;
          user_id: string;
          watched_at: string;
        };
        Insert: {
          created_at?: string;
          episode_key?: never;
          episode_number: number;
          id?: never;
          season_number: number;
          show_tmdb_id: number;
          user_id: string;
          watched_at?: string;
        };
        Update: {
          created_at?: string;
          episode_key?: never;
          episode_number?: number;
          id?: never;
          season_number?: number;
          show_tmdb_id?: number;
          user_id?: string;
          watched_at?: string;
        };
        Relationships: [
          {
            columns: ["show_tmdb_id", "season_number", "episode_number"];
            foreignKeyName: "watched_episodes_episode_fk";
            isOneToOne: false;
            referencedColumns: ["show_tmdb_id", "season_number", "episode_number"];
            referencedRelation: "episodes";
          },
          {
            columns: ["user_id", "show_tmdb_id"];
            foreignKeyName: "watched_episodes_library_fk";
            isOneToOne: false;
            referencedColumns: ["user_id", "show_tmdb_id"];
            referencedRelation: "user_shows";
          },
          {
            columns: ["user_id"];
            foreignKeyName: "watched_episodes_user_id_fkey";
            isOneToOne: false;
            referencedColumns: ["id"];
            referencedRelation: "users";
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      handle_new_user: {
        Args: NoArgs;
        Returns: unknown;
      };
      set_updated_at: {
        Args: NoArgs;
        Returns: unknown;
      };
      set_user_show_status_updated_at: {
        Args: NoArgs;
        Returns: unknown;
      };
    };
    Enums: {
      show_watch_status: "watchlist" | "watching" | "watched" | "dropped";
    };
    CompositeTypes: Record<string, never>;
  };
};
