import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { ordersAPI } from '../services/api';
import '../App.css';

export default function Dashboard() {
  const [metrics, setMetrics] = useState({
    totalOrders: 0,
    completedOrders: 0,
    totalStock: 0,
    totalRevenue: 0
  });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();

    const socket = io(process.env.REACT_APP_API_URL || 'http://localhost:5001');
    
    socket.on('orderCreated', (newOrder) => {
      console.log('New order created:', newOrder);
      setOrders(prev => [newOrder, ...prev]);
      setMetrics(prev => ({
        ...prev,
        totalOrders: prev.totalOrders + 1
      }));
    });

    socket.on('orderUpdated', (updatedOrder) => {
      console.log('Order updated:', updatedOrder);
      setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
    });

    return () => socket.disconnect();
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await ordersAPI.getAll();
      const ordersData = response.data;
      
      setOrders(ordersData);
      setMetrics({
        totalOrders: ordersData.length,
        completedOrders: ordersData.filter(o => o.status === 'completed').length,
        totalStock: 0,
        totalRevenue: ordersData
          .filter(o => o.status === 'completed')
          .reduce((sum, o) => sum + (o.total_amount || 0), 0)
      });
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching metrics:', err);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="dashboard-container"><p>Loading...</p></div>;
  }

  return (
    <div className="dashboard-container">
      <h1>Dashboard</h1>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-content">
            <p>Total Orders</p>
            <div>{metrics.totalOrders}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-content">
            <p>Completed</p>
            <div>{metrics.completedOrders}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-content">
            <p>Total Revenue</p>
            <div>Rp {metrics.totalRevenue.toLocaleString('id-ID')}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-content">
            <p>Inventory</p>
            <div>{metrics.totalStock}</div>
          </div>
        </div>
      </div>

      <div className="orders-table">
        <h2>Recent Orders</h2>
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 10).map(order => (
              <tr key={order.id}>
                <td>{order.order_number}</td>
                <td>{order.customer_name}</td>
                <td>Rp {order.total_amount?.toLocaleString('id-ID') || 0}</td>
                <td>
                  <span className={`status-badge status-${order.status === 'completed' ? 'completed' : order.status === 'pending' ? 'pending' : 'default'}`}>
                    {order.status}
                  </span>
                </td>
                <td>{new Date(order.created_at).toLocaleDateString('id-ID')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}