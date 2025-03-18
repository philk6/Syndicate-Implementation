import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';
import { OrderProduct } from '../../../../lib/types';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('order_products')
      .select('*')
      .returns<OrderProduct[]>();
    
    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ data });
  } catch (err) {
    console.error('Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 