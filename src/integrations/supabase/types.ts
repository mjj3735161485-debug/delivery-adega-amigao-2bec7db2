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
      business_hours: {
        Row: {
          aberto: boolean
          abre: string
          fecha: string
          updated_at: string
          weekday: number
        }
        Insert: {
          aberto?: boolean
          abre?: string
          fecha?: string
          updated_at?: string
          weekday: number
        }
        Update: {
          aberto?: boolean
          abre?: string
          fecha?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: []
      }
      cashback_ledger: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          order_id: string | null
          tipo: string
          user_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          order_id?: string | null
          tipo: string
          user_id: string
          valor: number
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          order_id?: string | null
          tipo?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "cashback_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          nome: string
          ordem: number
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          slug?: string
        }
        Relationships: []
      }
      courier_presence: {
        Row: {
          courier_id: string
          lat: number | null
          lng: number | null
          online: boolean
          updated_at: string
        }
        Insert: {
          courier_id: string
          lat?: number | null
          lng?: number | null
          online?: boolean
          updated_at?: string
        }
        Update: {
          courier_id?: string
          lat?: number | null
          lng?: number | null
          online?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_presence_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: true
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          ativo: boolean
          comissao_percent: number
          created_at: string
          diaria: number
          id: string
          limite_comissao_mes: number
          meta_entregas_mes: number
          nome: string
          telefone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          comissao_percent?: number
          created_at?: string
          diaria?: number
          id?: string
          limite_comissao_mes?: number
          meta_entregas_mes?: number
          nome: string
          telefone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          comissao_percent?: number
          created_at?: string
          diaria?: number
          id?: string
          limite_comissao_mes?: number
          meta_entregas_mes?: number
          nome?: string
          telefone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      customer_profiles: {
        Row: {
          bairro_id: string | null
          created_at: string
          endereco_padrao: string | null
          nome: string | null
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bairro_id?: string | null
          created_at?: string
          endereco_padrao?: string | null
          nome?: string | null
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bairro_id?: string | null
          created_at?: string
          endereco_padrao?: string | null
          nome?: string | null
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_bairro_id_fkey"
            columns: ["bairro_id"]
            isOneToOne: false
            referencedRelation: "delivery_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_areas: {
        Row: {
          ativo: boolean
          bairro: string
          created_at: string
          id: string
          taxa: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bairro: string
          created_at?: string
          id?: string
          taxa: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string
          created_at?: string
          id?: string
          taxa?: number
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          nome_snapshot: string
          order_id: string
          preco_snapshot: number
          product_id: string | null
          quantidade: number
        }
        Insert: {
          created_at?: string
          id?: string
          nome_snapshot: string
          order_id: string
          preco_snapshot: number
          product_id?: string | null
          quantidade: number
        }
        Update: {
          created_at?: string
          id?: string
          nome_snapshot?: string
          order_id?: string
          preco_snapshot?: number
          product_id?: string | null
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          access_token: string
          bairro: string | null
          cliente_nome: string
          cliente_telefone: string
          courier_id: string | null
          created_at: string
          customer_user_id: string | null
          delivered_at: string | null
          destino_lat: number | null
          destino_lng: number | null
          endereco: string
          id: string
          numero: number
          observacoes: string | null
          pagamento: string
          rota_iniciada_at: string | null
          status: string
          status_updated_at: string
          subtotal: number
          taxa_entrega: number
          tipo_entrega: string
          total: number
          troco_para: number | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          access_token?: string
          bairro?: string | null
          cliente_nome: string
          cliente_telefone: string
          courier_id?: string | null
          created_at?: string
          customer_user_id?: string | null
          delivered_at?: string | null
          destino_lat?: number | null
          destino_lng?: number | null
          endereco: string
          id?: string
          numero?: number
          observacoes?: string | null
          pagamento: string
          rota_iniciada_at?: string | null
          status?: string
          status_updated_at?: string
          subtotal: number
          taxa_entrega?: number
          tipo_entrega?: string
          total: number
          troco_para?: number | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          access_token?: string
          bairro?: string | null
          cliente_nome?: string
          cliente_telefone?: string
          courier_id?: string | null
          created_at?: string
          customer_user_id?: string | null
          delivered_at?: string | null
          destino_lat?: number | null
          destino_lng?: number | null
          endereco?: string
          id?: string
          numero?: number
          observacoes?: string | null
          pagamento?: string
          rota_iniciada_at?: string | null
          status?: string
          status_updated_at?: string
          subtotal?: number
          taxa_entrega?: number
          tipo_entrega?: string
          total?: number
          troco_para?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          descricao: string | null
          destaque: boolean
          disponivel: boolean
          estoque: number | null
          id: string
          imagem_url: string | null
          nome: string
          ordem: number
          preco: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          descricao?: string | null
          destaque?: boolean
          disponivel?: boolean
          estoque?: number | null
          id?: string
          imagem_url?: string | null
          nome: string
          ordem?: number
          preco: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          descricao?: string | null
          destaque?: boolean
          disponivel?: boolean
          estoque?: number | null
          id?: string
          imagem_url?: string | null
          nome?: string
          ordem?: number
          preco?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          ativo: boolean
          cashback_percent: number
          endereco: string
          horario: string
          id: number
          logo_url: string | null
          nome: string
          taxa_entrega: number
          updated_at: string
          whatsapp: string
        }
        Insert: {
          ativo?: boolean
          cashback_percent?: number
          endereco?: string
          horario?: string
          id?: number
          logo_url?: string | null
          nome?: string
          taxa_entrega?: number
          updated_at?: string
          whatsapp?: string
        }
        Update: {
          ativo?: boolean
          cashback_percent?: number
          endereco?: string
          horario?: string
          id?: number
          logo_url?: string | null
          nome?: string
          taxa_entrega?: number
          updated_at?: string
          whatsapp?: string
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
      [_ in never]: never
    }
    Functions: {
      _norm_bairro: { Args: { _s: string }; Returns: string }
      accept_order: { Args: { _numero: number }; Returns: Json }
      admin_courier_deliveries_range: {
        Args: { _courier_id: string; _from: string; _to: string }
        Returns: Json
      }
      admin_list_users: {
        Args: { _limit?: number; _search?: string }
        Returns: Json
      }
      admin_month_report: { Args: { _ref: string }; Returns: Json }
      admin_register_courier: {
        Args: { _nome: string; _telefone: string; _user_id: string }
        Returns: Json
      }
      admin_set_courier_ativo: {
        Args: { _ativo: boolean; _user_id: string }
        Returns: Json
      }
      admin_set_role: {
        Args: { _grant: boolean; _role: string; _user_id: string }
        Returns: Json
      }
      auto_advance_pickup_orders: { Args: { _minutes?: number }; Returns: Json }
      cancel_order_by_customer: {
        Args: { _numero: number; _token: string }
        Returns: Json
      }
      courier_active_load: {
        Args: { _courier_id: string; _numero: number }
        Returns: Json
      }
      courier_month_summary: {
        Args: { _courier_id: string; _ref: string }
        Returns: Json
      }
      get_courier_for_order: {
        Args: { _numero: number; _token: string }
        Returns: Json
      }
      get_my_cashback_balance: { Args: never; Returns: number }
      get_order_by_token: {
        Args: { _numero: number; _token: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_store_open: { Args: never; Returns: Json }
      mark_delivered: { Args: { _numero: number }; Returns: Json }
      match_delivery_fee: { Args: { _candidates: string[] }; Returns: Json }
      min_delivery_fee: { Args: never; Returns: number }
      place_order: { Args: { _items: Json; _order: Json }; Returns: Json }
      self_register_staff: {
        Args: { _nome: string; _role: string; _telefone: string }
        Returns: Json
      }
      start_route_to_customer: { Args: { _numero: number }; Returns: string }
      update_courier_presence: {
        Args: { _lat: number; _lng: number; _online: boolean }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "motoboy"
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
      app_role: ["admin", "motoboy"],
    },
  },
} as const
