<div className="flex flex-col mb-6">
  <Link href="/orders" className="text-[#c8aa64] hover:text-[#9d864e] mb-2">
    &larr; Back to Orders
  </Link>
  <h1 className="text-3xl font-bold text-white">Order #{order.order_id}</h1>
</div>

<div className="bg-[#18181A] rounded-lg p-6">
  {/* <h2 className="text-xl font-semibold text-white mb-4">Order Details</h2> */}
  <div className="flex flex-wrap gap-4 justify-between">
    <p className="text-gray-300 bg-[#212123] px-4 py-2 rounded"><span className="font-medium">Lead Time:</span> {order.leadtime} days</p>
    <p className="text-gray-300 bg-[#212123] px-4 py-2 rounded">
      <span className="font-medium">Deadline:</span> {new Date(order.deadline).toLocaleString()}
    </p>
    <p className="text-gray-300 bg-[#212123] px-4 py-2 rounded">
      <span className="font-medium">Label Upload Deadline:</span> {new Date(order.label_upload_deadline).toLocaleString()}
    </p>
    <p className="text-gray-300 bg-[#212123] px-4 py-2 rounded">
      <span className="font-medium">Status:</span> {order.order_statuses[0]?.description || 'N/A'}
    </p>
  </div>
</div> 