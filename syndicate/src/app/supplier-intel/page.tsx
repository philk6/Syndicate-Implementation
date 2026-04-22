import { redirect } from 'next/navigation';

// Native Supplier Intel port (was an iframe wrapper). Top-level route
// redirects to the dashboard.
export default function SupplierIntelIndex() {
  redirect('/supplier-intel/dashboard');
}
