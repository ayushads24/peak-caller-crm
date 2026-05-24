export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          lead_id: string
          metadata: Json | null
          type: Database["public"]["Enums"]["activity_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          lead_id: string
          metadata?: Json | null
          type: Database["public"]["Enums"]["activity_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
          type?: Database["public"]["Enums"]["activity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          created_at: string
          id: string
          punch_in_at: string
          punch_out_at: string | null
          user_id: string
          work_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          punch_in_at?: string
          punch_out_at?: string | null
          user_id: string
          work_date?: string
        }
        Update: {
          created_at?: string
          id?: string
          punch_in_at?: string
          punch_out_at?: string | null
          user_id?: string
          work_date?: string
        }
        Relationships: []
      }
      breaks: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          started_at: string
          type: Database["public"]["Enums"]["break_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          type?: Database["public"]["Enums"]["break_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          type?: Database["public"]["Enums"]["break_type"]
          user_id?: string
        }
        Relationships: []
      }
      calling_flow_items: {
        Row: {
          attempts_done: number
          attempts_planned: number
          category: Database["public"]["Enums"]["flow_category"]
          completed_at: string | null
          created_at: string
          flow_id: string
          id: string
          lead_id: string
          priority: number
          status: Database["public"]["Enums"]["flow_item_status"]
        }
        Insert: {
          attempts_done?: number
          attempts_planned?: number
          category: Database["public"]["Enums"]["flow_category"]
          completed_at?: string | null
          created_at?: string
          flow_id: string
          id?: string
          lead_id: string
          priority?: number
          status?: Database["public"]["Enums"]["flow_item_status"]
        }
        Update: {
          attempts_done?: number
          attempts_planned?: number
          category?: Database["public"]["Enums"]["flow_category"]
          completed_at?: string | null
          created_at?: string
          flow_id?: string
          id?: string
          lead_id?: string
          priority?: number
          status?: Database["public"]["Enums"]["flow_item_status"]
        }
        Relationships: [
          {
            foreignKeyName: "calling_flow_items_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "calling_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calling_flow_items_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      calling_flows: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          name: string | null
          status: Database["public"]["Enums"]["flow_status"]
          user_id: string
          work_date: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          name?: string | null
          status?: Database["public"]["Enums"]["flow_status"]
          user_id: string
          work_date?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          name?: string | null
          status?: Database["public"]["Enums"]["flow_status"]
          user_id?: string
          work_date?: string
        }
        Relationships: []
      }
      calls: {
        Row: {
          called_at: string
          created_at: string
          duration_seconds: number
          id: string
          lead_id: string
          notes: string | null
          status: Database["public"]["Enums"]["call_status"]
          user_id: string
        }
        Insert: {
          called_at?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          lead_id: string
          notes?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          user_id: string
        }
        Update: {
          called_at?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          lead_id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          user_id?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          created_at: string
          duplicate_count: number
          error_count: number
          errors: Json | null
          filename: string
          id: string
          inserted_count: number
          total_rows: number
          user_id: string
        }
        Insert: {
          created_at?: string
          duplicate_count?: number
          error_count?: number
          errors?: Json | null
          filename: string
          id?: string
          inserted_count?: number
          total_rows?: number
          user_id: string
        }
        Update: {
          created_at?: string
          duplicate_count?: number
          error_count?: number
          errors?: Json | null
          filename?: string
          id?: string
          inserted_count?: number
          total_rows?: number
          user_id?: string
        }
        Relationships: []
      }
      labels: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      lead_labels: {
        Row: {
          label_id: string
          lead_id: string
        }
        Insert: {
          label_id: string
          lead_id: string
        }
        Update: {
          label_id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_labels_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          client_name: string
          closed_at: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          imported_at: string | null
          lead_source: string | null
          phone: string | null
          sales_value: number | null
          status_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          client_name: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          imported_at?: string | null
          lead_source?: string | null
          phone?: string | null
          sales_value?: number | null
          status_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          client_name?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          imported_at?: string | null
          lead_source?: string | null
          phone?: string | null
          sales_value?: number | null
          status_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          notes: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          notes?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["meeting_status"]
          title?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          notes?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["meeting_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          key: string
          label: string
          module: string
          sort_order: number
        }
        Insert: {
          action: string
          key: string
          label: string
          module: string
          sort_order?: number
        }
        Update: {
          action?: string
          key?: string
          label?: string
          module?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          designation: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
          phone: string | null
          team_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          designation?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          last_login_at?: string | null
          phone?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          designation?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          phone?: string | null
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          is_lost: boolean
          is_sales: boolean
          name: string
          sort_order: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_sales?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_sales?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          leader_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          leader_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          leader_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      profiles_directory: {
        Row: {
          avatar_url: string | null
          designation: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          team_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          designation?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          team_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          designation?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_access_lead: {
        Args: { _lead_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_user_workflow: {
        Args: { _actor: string; _target: string }
        Returns: boolean
      }
      has_permission: {
        Args: { _key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_manager: { Args: { _user_id: string }; Returns: boolean }
      is_team_leader_of: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_member_of_leader: {
        Args: { _leader: string; _member: string }
        Returns: boolean
      }
    }
    Enums: {
      activity_type:
        | "lead_created"
        | "status_changed"
        | "note_added"
        | "task_created"
        | "task_completed"
        | "meeting_scheduled"
        | "meeting_completed"
        | "call_logged"
        | "assignment_changed"
        | "lead_updated"
        | "label_changed"
      app_role:
        | "admin"
        | "manager"
        | "caller"
        | "team_leader"
        | "project_manager"
      break_type: "lunch" | "tea" | "meeting" | "other"
      call_status:
        | "connected"
        | "not_connected"
        | "voicemail"
        | "busy"
        | "wrong_number"
      flow_category:
        | "fresh"
        | "interested_meeting"
        | "quotation_sent"
        | "followup"
      flow_item_status:
        | "pending"
        | "in_progress"
        | "done"
        | "skipped"
        | "rescheduled"
      flow_status: "active" | "paused" | "completed"
      meeting_status: "scheduled" | "completed" | "cancelled" | "rescheduled"
      task_status: "pending" | "in_progress" | "completed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_type: [
        "lead_created",
        "status_changed",
        "note_added",
        "task_created",
        "task_completed",
        "meeting_scheduled",
        "meeting_completed",
        "call_logged",
        "assignment_changed",
        "lead_updated",
        "label_changed",
      ],
      app_role: [
        "admin",
        "manager",
        "caller",
        "team_leader",
        "project_manager",
      ],
      break_type: ["lunch", "tea", "meeting", "other"],
      call_status: [
        "connected",
        "not_connected",
        "voicemail",
        "busy",
        "wrong_number",
      ],
      flow_category: [
        "fresh",
        "interested_meeting",
        "quotation_sent",
        "followup",
      ],
      flow_item_status: [
        "pending",
        "in_progress",
        "done",
        "skipped",
        "rescheduled",
      ],
      flow_status: ["active", "paused", "completed"],
      meeting_status: ["scheduled", "completed", "cancelled", "rescheduled"],
      task_status: ["pending", "in_progress", "completed"],
    },
  },
} as const
