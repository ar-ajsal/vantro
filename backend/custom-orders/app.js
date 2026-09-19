document.addEventListener('DOMContentLoaded', () => {
    // Served from the admin app (same origin as the Dashtar SPA), so calls go
    // through the admin server's same-origin "/api" proxy → backend. No hardcoded
    // host, works in dev and prod wherever the admin server is deployed.
    const API_BASE = '/api';

    // Reuse the Dashtar SPA's admin session. It stores the JWT in an "adminInfo"
    // cookie (JSON with a .token field). We read it and send it as a Bearer token
    // so these now-protected order endpoints authorize correctly.
    function getAdminToken() {
        try {
            const m = document.cookie.match(/(?:^|;\s*)adminInfo=([^;]+)/);
            if (!m) return null;
            const info = JSON.parse(decodeURIComponent(m[1]));
            return info && info.token ? info.token : null;
        } catch (e) {
            return null;
        }
    }

    function authHeaders(extra) {
        const headers = Object.assign({}, extra || {});
        const token = getAdminToken();
        if (token) headers.Authorization = 'Bearer ' + token;
        return headers;
    }

    function requireAuthOrRedirect(res) {
        if (res && (res.status === 401 || res.status === 403)) {
            // Session missing/expired — bounce to the admin login.
            window.location.href = '/login';
            return true;
        }
        return false;
    }

    // DOM Elements
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const paymentFilter = document.getElementById('paymentFilter');
    const refreshBtn = document.getElementById('refreshBtn');
    const ordersTableBody = document.getElementById('ordersTableBody');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const pageInfo = document.getElementById('pageInfo');
    const totalOrdersInfo = document.getElementById('totalOrdersInfo');

    const orderModal = document.getElementById('orderModal');
    const modalContent = document.getElementById('modalContent');
    const closeModalBtn = document.getElementById('closeModalBtn');
    
    let currentPage = 1;
    const limit = 10;
    let totalPages = 1;
    let currentOrder = null;

    // Fetch Orders
    async function fetchOrders() {
        const search = searchInput.value.trim();
        const status = statusFilter.value;
        const paymentStatus = paymentFilter.value;

        ordersTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-10 text-center text-gray-500">
                    <div class="flex flex-col items-center justify-center">
                        <i data-lucide="loader-2" class="w-8 h-8 animate-spin text-blue-500 mb-2"></i>
                        <p>Loading orders...</p>
                    </div>
                </td>
            </tr>
        `;
        lucide.createIcons();

        try {
            const queryParams = new URLSearchParams({
                page: currentPage,
                limit,
                ...(search && { search }),
                ...(status && { status }),
                ...(paymentStatus && { paymentStatus })
            });

            const res = await fetch(`${API_BASE}/orders?${queryParams.toString()}`, {
                headers: authHeaders()
            });
            if (requireAuthOrRedirect(res)) return;
            const data = await res.json();

            totalPages = data.pages || 1;
            renderOrders(data.orders || []);
            
            const start = (currentPage - 1) * limit + 1;
            const end = Math.min(currentPage * limit, data.totalDoc);
            pageInfo.textContent = `${data.totalDoc > 0 ? start : 0} - ${end}`;
            totalOrdersInfo.textContent = data.totalDoc || 0;
            
            prevBtn.disabled = currentPage === 1;
            nextBtn.disabled = currentPage === totalPages || totalPages === 0;

        } catch (error) {
            console.error('Failed to fetch orders:', error);
            ordersTableBody.innerHTML = `
                <tr><td colspan="7" class="px-6 py-10 text-center text-red-500">Failed to load orders. Please try again.</td></tr>
            `;
        }
    }

    // Render Orders
    function renderOrders(orders) {
        if (orders.length === 0) {
            ordersTableBody.innerHTML = `
                <tr><td colspan="7" class="px-6 py-10 text-center text-gray-500">No orders found.</td></tr>
            `;
            return;
        }

        ordersTableBody.innerHTML = orders.map(order => {
            // Support both old schema (userInfo, invoice, paymentDetails) and new schema (customerName, orderId, paymentStatus)
            const customerName = order.customerName || order.userInfo?.name || 'N/A';
            const phone = order.phone || order.userInfo?.contact || '';
            const orderId = order.orderId || (order.invoice ? `INV-${order.invoice}` : 'N/A');
            const paymentStatus = order.paymentStatus || (order.paymentDetails?.razorpay_payment_id ? 'Paid' : 'Pending');
            const paymentMethod = order.paymentMethod || 'Razorpay';
            return `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-6 py-4 font-medium text-gray-900">${orderId}</td>
                <td class="px-6 py-4 whitespace-nowrap">${new Date(order.createdAt).toLocaleDateString()}</td>
                <td class="px-6 py-4">
                    <div class="font-medium text-gray-800">${customerName}</div>
                    <div class="text-xs text-gray-500">${phone}</div>
                </td>
                <td class="px-6 py-4 font-medium text-gray-900">₹${order.total?.toFixed(2)}</td>
                <td class="px-6 py-4">
                    <span class="status-badge payment-${paymentStatus?.toLowerCase()}">${paymentStatus}</span>
                    <div class="text-xs text-gray-500 mt-1">${paymentMethod}</div>
                </td>
                <td class="px-6 py-4">
                    <span class="status-badge status-${order.status?.toLowerCase().replace(/ /g, '_')}">${order.status}</span>
                </td>
                <td class="px-6 py-4 text-right">
                    <button class="view-btn text-blue-600 hover:text-blue-800 font-medium bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors" data-id="${order._id}">
                        View Details
                    </button>
                </td>
            </tr>
        `}).join('');

        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const order = orders.find(o => o._id === id);
                if (order) openModal(order);
            });
        });
    }

    // Modal Logic
    function openModal(order) {
        currentOrder = order;
        // Support both old and new schema
        const customerName = order.customerName || order.userInfo?.name || 'N/A';
        const phone = order.phone || order.userInfo?.contact || 'N/A';
        const email = order.email || order.userInfo?.email || '';
        const orderId = order.orderId || (order.invoice ? `INV-${order.invoice}` : 'N/A');
        const paymentStatus = order.paymentStatus || (order.paymentDetails?.razorpay_payment_id ? 'Paid' : 'Pending');
        const paymentMethod = order.paymentMethod || 'Razorpay';
        const paymentReference = order.paymentReference || order.paymentDetails?.razorpay_payment_id || '';

        document.getElementById('modalOrderId').textContent = `Order #${orderId}`;
        document.getElementById('modalOrderDate').textContent = `Placed on ${new Date(order.createdAt).toLocaleString()}`;
        
        // Statuses
        document.getElementById('updateStatusSelect').value = order.status || 'Pending';
        document.getElementById('updatePaymentStatusSelect').value = paymentStatus;
        
        // Customer Info
        const deliveryAddress = order.deliveryAddress || order.userInfo || {};
        document.getElementById('modalCustomerInfo').innerHTML = `
            <p><strong class="text-gray-900">Name:</strong> ${customerName}</p>
            <p><strong class="text-gray-900">Phone:</strong> ${phone}</p>
            ${email ? `<p><strong class="text-gray-900">Email:</strong> ${email}</p>` : ''}
            <div class="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <strong class="text-gray-900 block mb-1">Delivery Address:</strong>
                ${deliveryAddress.street || deliveryAddress.address || ''}, ${deliveryAddress.city || ''}<br>
                ${deliveryAddress.district ? deliveryAddress.district + ', ' : ''}${deliveryAddress.state || ''} - ${deliveryAddress.zip || deliveryAddress.zipCode || ''}
            </div>
        `;

        // Payment Info
        document.getElementById('modalPaymentInfo').innerHTML = `
            <p><strong class="text-gray-900">Method:</strong> ${paymentMethod}</p>
            <p><strong class="text-gray-900">Status:</strong> <span class="status-badge payment-${paymentStatus?.toLowerCase()}">${paymentStatus}</span></p>
            ${paymentReference ? `<p><strong class="text-gray-900">Reference/UTR:</strong> ${paymentReference}</p>` : ''}
            ${order.paymentDate ? `<p><strong class="text-gray-900">Paid On:</strong> ${new Date(order.paymentDate).toLocaleString()}</p>` : ''}
            ${order.paymentScreenshot ? `
                <div class="mt-3">
                    <strong class="text-gray-900 block mb-1">Payment Screenshot:</strong>
                    <a href="${order.paymentScreenshot}" target="_blank" class="block rounded-lg overflow-hidden border border-gray-200 w-32 h-32 hover:opacity-90 transition-opacity">
                        <img src="${order.paymentScreenshot}" alt="Screenshot" class="w-full h-full object-cover">
                    </a>
                </div>
            ` : ''}
        `;

        // Tracking Info
        document.getElementById('trackCourier').value = order.shippingDetails?.courierName || '';
        document.getElementById('trackAWB').value = order.shippingDetails?.awb || '';
        document.getElementById('trackUrl').value = order.shippingDetails?.trackingUrl || '';

        // Order Items
        const itemsHtml = (order.cart || []).map(item => `
            <tr>
                <td class="px-4 py-3 flex items-center space-x-3">
                    ${item.image ? `<img src="${item.image}" class="w-10 h-10 rounded-md object-cover border border-gray-100">` : ''}
                    <div>
                        <p class="font-medium text-gray-900">${item.name || 'Product'}</p>
                        ${item.variant ? `<p class="text-xs text-gray-500">Variant: ${item.variant}</p>` : ''}
                    </div>
                </td>
                <td class="px-4 py-3 text-gray-600">₹${item.price?.toFixed(2)}</td>
                <td class="px-4 py-3 text-center text-gray-900 font-medium">${item.quantity}</td>
                <td class="px-4 py-3 text-right text-gray-900 font-medium">₹${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</td>
            </tr>
        `).join('');
        document.getElementById('modalOrderItems').innerHTML = itemsHtml;

        document.getElementById('modalOrderSummary').innerHTML = `
            <tr><td colspan="3" class="px-4 py-2 text-right text-gray-500">Subtotal</td><td class="px-4 py-2 text-right font-medium">₹${order.subTotal?.toFixed(2)}</td></tr>
            <tr><td colspan="3" class="px-4 py-2 text-right text-gray-500">Shipping</td><td class="px-4 py-2 text-right font-medium">₹${order.shippingFee?.toFixed(2)}</td></tr>
            <tr><td colspan="3" class="px-4 py-2 text-right text-gray-500">Discount</td><td class="px-4 py-2 text-right font-medium text-red-500">-₹${order.discount?.toFixed(2)}</td></tr>
            <tr><td colspan="3" class="px-4 py-3 text-right font-bold text-gray-900 text-base">Total</td><td class="px-4 py-3 text-right font-bold text-blue-600 text-base">₹${order.total?.toFixed(2)}</td></tr>
        `;

        // Show Modal
        orderModal.classList.remove('hidden');
        // Trigger animation
        setTimeout(() => {
            modalContent.classList.remove('translate-x-full');
        }, 10);
    }

    function closeModal() {
        modalContent.classList.add('translate-x-full');
        setTimeout(() => {
            orderModal.classList.add('hidden');
            currentOrder = null;
        }, 300);
    }

    closeModalBtn.addEventListener('click', closeModal);
    orderModal.addEventListener('click', (e) => {
        if (e.target === orderModal) closeModal();
    });

    // Update Status
    document.getElementById('saveStatusBtn').addEventListener('click', async () => {
        if (!currentOrder) return;
        const status = document.getElementById('updateStatusSelect').value;
        const paymentStatus = document.getElementById('updatePaymentStatusSelect').value;
        
        try {
            const res = await fetch(`${API_BASE}/orders/${currentOrder._id}`, {
                method: 'PUT',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ status, paymentStatus })
            });
            if (requireAuthOrRedirect(res)) return;
            if (res.ok) {
                showToast('Order status updated successfully');
                fetchOrders();
                closeModal();
            } else {
                showToast('Failed to update status', true);
            }
        } catch (e) {
            showToast('Error updating status', true);
        }
    });

    // Update Tracking
    document.getElementById('saveTrackingBtn').addEventListener('click', async () => {
        if (!currentOrder) return;
        const shippingDetails = {
            courierName: document.getElementById('trackCourier').value.trim(),
            awb: document.getElementById('trackAWB').value.trim(),
            trackingUrl: document.getElementById('trackUrl').value.trim()
        };
        
        try {
            const res = await fetch(`${API_BASE}/orders/${currentOrder._id}`, {
                method: 'PUT',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ shippingDetails })
            });
            if (requireAuthOrRedirect(res)) return;
            if (res.ok) {
                showToast('Tracking info updated successfully');
                fetchOrders();
                closeModal();
            } else {
                showToast('Failed to update tracking', true);
            }
        } catch (e) {
            showToast('Error updating tracking', true);
        }
    });

    // Toast
    function showToast(msg, isError = false) {
        const toast = document.getElementById('toast');
        document.getElementById('toastMsg').textContent = msg;
        const icon = document.getElementById('toastIcon');
        
        if (isError) {
            icon.setAttribute('data-lucide', 'x-circle');
            icon.classList.replace('text-green-400', 'text-red-400');
        } else {
            icon.setAttribute('data-lucide', 'check-circle');
            icon.classList.replace('text-red-400', 'text-green-400');
        }
        lucide.createIcons();

        toast.classList.remove('translate-y-20', 'opacity-0');
        setTimeout(() => {
            toast.classList.add('translate-y-20', 'opacity-0');
        }, 3000);
    }

    // Event Listeners
    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') { currentPage = 1; fetchOrders(); }
    });
    statusFilter.addEventListener('change', () => { currentPage = 1; fetchOrders(); });
    paymentFilter.addEventListener('change', () => { currentPage = 1; fetchOrders(); });
    refreshBtn.addEventListener('click', () => { currentPage = 1; fetchOrders(); });
    
    prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; fetchOrders(); } });
    nextBtn.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; fetchOrders(); } });

    // Initial fetch
    fetchOrders();
});
