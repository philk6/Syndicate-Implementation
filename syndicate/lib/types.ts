// Define your database table types here
export interface OrderProduct {
  id: number;
  order_id: number;
  product_id: number;
  quantity: number;
  price: number;
  created_at?: string;
  updated_at?: string;
  // Add any other fields that exist in your table
}

export interface OrderStatus {
  order_status_id: number;
  description: string;
  created_at?: string;
  updated_at?: string;
  // Add any other fields that exist in your table
}

// Add more interfaces for other tables as needed 