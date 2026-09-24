export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          locale: string
          phone: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          locale?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          locale?: string
          phone?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          delivery_status: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          last_message_id: string | null
          last_sent_at: string | null
          message: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          token_hash: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          delivery_status?: string
          email: string
          expires_at: string
          id?: string
          invited_by?: string | null
          last_message_id?: string | null
          last_sent_at?: string | null
          message?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          token_hash: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          delivery_status?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          last_message_id?: string | null
          last_sent_at?: string | null
          message?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          token_hash?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_line1: string | null
          address_line2: string | null
          address_postal_code: string | null
          address_region: string | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          logo_url: string | null
          name: string
          parent_workspace_id: string | null
          parent_workspace_type: Database["public"]["Enums"]["workspace_type"] | null
          slug: string
          timezone: string
          updated_at: string
          website_url: string | null
          workspace_type: Database["public"]["Enums"]["workspace_type"]
          member_count: number | null
          pending_invitation_count: number | null
          viewer_role: Database["public"]["Enums"]["workspace_role"] | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_line2?: string | null
          address_postal_code?: string | null
          address_region?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name: string
          parent_workspace_id?: string | null
          parent_workspace_type?: Database["public"]["Enums"]["workspace_type"] | null
          slug: string
          timezone?: string
          updated_at?: string
          website_url?: string | null
          workspace_type?: Database["public"]["Enums"]["workspace_type"]
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_line1?: string | null
          address_line2?: string | null
          address_postal_code?: string | null
          address_region?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          business_email?: string | null
          business_name?: string | null
          business_phone?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          parent_workspace_id?: string | null
          parent_workspace_type?: Database["public"]["Enums"]["workspace_type"] | null
          slug?: string
          timezone?: string
          updated_at?: string
          website_url?: string | null
          workspace_type?: Database["public"]["Enums"]["workspace_type"]
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspaces_parent_fkey"
            columns: ["parent_workspace_id", "parent_workspace_type"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "workspace_type"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invitation: {
        Args: { p_token_hash: string }
        Returns: {
          outcome: string
          workspace_slug: string
        }[]
      }
      create_client_workspace: {
        Args: {
          p_address_city?: string
          p_address_country?: string
          p_address_line1?: string
          p_address_line2?: string
          p_address_postal_code?: string
          p_address_region?: string
          p_agency_id: string
          p_business_email?: string
          p_business_name?: string
          p_business_phone?: string
          p_name: string
          p_slug?: string
          p_timezone?: string
          p_website_url?: string
        }
        Returns: {
          address_city: string | null
          address_country: string | null
          address_line1: string | null
          address_line2: string | null
          address_postal_code: string | null
          address_region: string | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          logo_url: string | null
          name: string
          parent_workspace_id: string | null
          parent_workspace_type: Database["public"]["Enums"]["workspace_type"] | null
          slug: string
          timezone: string
          updated_at: string
          website_url: string | null
          workspace_type: Database["public"]["Enums"]["workspace_type"]
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_workspace: {
        Args: { p_name: string; p_slug?: string; p_timezone?: string }
        Returns: {
          address_city: string | null
          address_country: string | null
          address_line1: string | null
          address_line2: string | null
          address_postal_code: string | null
          address_region: string | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          business_email: string | null
          business_name: string | null
          business_phone: string | null
          created_at: string
          created_by: string | null
          id: string
          logo_url: string | null
          name: string
          parent_workspace_id: string | null
          parent_workspace_type: Database["public"]["Enums"]["workspace_type"] | null
          slug: string
          timezone: string
          updated_at: string
          website_url: string | null
          workspace_type: Database["public"]["Enums"]["workspace_type"]
        }
        SetofOptions: {
          from: "*"
          to: "workspaces"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_workspace_invitation: {
        Args: {
          p_email: string
          p_message?: string
          p_role: Database["public"]["Enums"]["workspace_role"]
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: {
          invitation_expires_at: string
          invitation_id: string
          outcome: string
        }[]
      }
      get_workspace_invitation: {
        Args: { p_token_hash: string }
        Returns: {
          email: string
          expires_at: string
          inviter_name: string
          role: Database["public"]["Enums"]["workspace_role"]
          status: string
          workspace_name: string
          workspace_slug: string
        }[]
      }
      member_count: {
        Args: { "": Database["public"]["Tables"]["workspaces"]["Row"] }
        Returns: {
          error: true
        } & "the function public.member_count with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      pending_invitation_count: {
        Args: { "": Database["public"]["Tables"]["workspaces"]["Row"] }
        Returns: {
          error: true
        } & "the function public.pending_invitation_count with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
      rate_limit_hit: {
        Args: { p_key: string; p_window_seconds: number }
        Returns: {
          hits: number
          window_ends_at: string
        }[]
      }
      record_workspace_invitation_delivery: {
        Args: {
          p_delivered: boolean
          p_invitation_id: string
          p_message_id?: string
          p_token_hash: string
        }
        Returns: undefined
      }
      resend_workspace_invitation: {
        Args: {
          p_invitation_id: string
          p_token_hash: string
          p_workspace_id: string
        }
        Returns: {
          invitation_email: string
          invitation_expires_at: string
          invitation_message: string
          invitation_role: Database["public"]["Enums"]["workspace_role"]
          outcome: string
        }[]
      }
      revoke_workspace_invitation: {
        Args: { p_invitation_id: string; p_workspace_id: string }
        Returns: string
      }
      viewer_role: {
        Args: { "": Database["public"]["Tables"]["workspaces"]["Row"] }
        Returns: {
          error: true
        } & "the function public.viewer_role with parameter or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache"
      }
    }
    Enums: {
      workspace_role: "member" | "admin" | "owner"
      workspace_type: "agency" | "client"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      workspace_role: ["member", "admin", "owner"],
      workspace_type: ["agency", "client"],
    },
  },
} as const
