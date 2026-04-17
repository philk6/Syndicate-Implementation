export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@lib/supabase/admin';
import { OrderProduct } from '@lib/types';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
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