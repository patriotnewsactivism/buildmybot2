import {
  AlertCircle,
  BookOpen,
  Briefcase,
  Calendar,
  Check,
  CheckCircle,
  ClipboardList,
  Clock,
  Code,
  DollarSign,
  FileText,
  Loader,
  MessageSquare,
  Package,
  RefreshCw,
  Shield,
  ShoppingCart,
  X,
  Zap,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { buildApiUrl } from '../../services/apiConfig';

interface ServiceCatalogProps {
  organizationId: string;
  userId?: string;
}

interface ServiceOffering {
  id: string;
  name: string;
  description: string | null;
  serviceType: string;
  priceCents: number;
  stripePriceId: string | null;
  deliveryDays: number;
  features: string[];
  isActive: boolean;
  sortOrder: number;
}

interface ServiceOrder {
  id: string;
  organizationId: string;
  userId: string | null;
  serviceId: string;
  status: string;
  pricePaidCents: number | null;
  notes: string | null;
  deliveryNotes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const PremiumCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}
  >
    {children}
  </div>
);

const getServiceIcon = (serviceType: string) => {
  switch (serviceType) {
    case 'onboarding':
      return Package;
    case 'training':
      return BookOpen;
    case 'kb_import':
      return FileText;
    case 'custom':
      return Code;
    default:
      return Briefcase;
  }
};

const getServiceTypeLabel = (serviceType: string) => {
  switch (serviceType) {
    case 'onboarding':
      return 'Setup & Onboarding';
    case 'training':
      return 'Custom Training';
    case 'kb_import':
      return 'Knowledge Base Import';
    case 'custom':
      return 'Custom Development';
    default:
      return 'Service';
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pending' };
    case 'paid':
      return { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Paid' };
    case 'processing':
      return {
        bg: 'bg-indigo-100',
        text: 'text-indigo-800',
        label: 'Processing',
      };
    case 'completed':
      return {
        bg: 'bg-emerald-100',
        text: 'text-emerald-800',
        label: 'Completed',
      };
    case 'refunded':
      return { bg: 'bg-red-100', text: 'text-red-800', label: 'Refunded' };
    case 'canceled':
      return { bg: 'bg-slate-100', text: 'text-slate-800', label: 'Canceled' };
    default:
      return { bg: 'bg-slate-100', text: 'text-slate-600', label: status };
  }
};

export const ServiceCatalog: React.FC<ServiceCatalogProps> = ({
  organizationId,
  userId,
}) => {
  const [services, setServices] = useState<ServiceOffering[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedService, setSelectedService] =
    useState<ServiceOffering | null>(null);
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'catalog' | 'orders'>('catalog');

  useEffect(() => {
    if (organizationId) {
      fetchData();
    }
  }, [organizationId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [servicesRes, ordersRes] = await Promise.all([
        fetch(buildApiUrl('/revenue/services')),
        fetch(buildApiUrl(`/revenue/services/orders/${organizationId}`)),
      ]);

      const servicesData = await servicesRes.json();
      const ordersData = await ordersRes.json();

      setServices(Array.isArray(servicesData) ? servicesData : []);
      setOrders(Array.isArray(ordersData) ? ordersData : []);
    } catch (err) {
      console.error('Error fetching service catalog data:', err);
      setError('Failed to load service catalog');
    } finally {
      setLoading(false);
    }
  };

  const handleOrderSubmit = async () => {
    if (!selectedService || !organizationId) return;

    setSubmitting(true);
    try {
      const res = await fetch(buildApiUrl('/revenue/services/order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          userId,
          serviceId: selectedService.id,
          notes: orderNotes,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to create order');
      }

      await fetchData();
      setSelectedService(null);
      setOrderNotes('');
      setActiveTab('orders');
    } catch (err) {
      console.error('Error creating service order:', err);
      alert('Failed to create order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatPrice = (cents: number): string => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getServiceById = (serviceId: string): ServiceOffering | undefined => {
    return services.find((s) => s.id === serviceId);
  };

  const groupedServices = services.reduce(
    (acc, service) => {
      const type = service.serviceType;
      if (!acc[type]) acc[type] = [];
      acc[type].push(service);
      return acc;
    },
    {} as Record<string, ServiceOffering[]>,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-6 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-transparent to-amber-500/10" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-amber-500/20 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-sm font-medium">
                  Professional Services
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white via-orange-100 to-amber-200 bg-clip-text text-transparent">
                Service Catalog
              </h1>
              <p className="text-slate-400 mt-2">
                One-time services to accelerate your success
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-slate-400 text-sm">
                <Shield size={16} className="text-emerald-400" />
                <span>Expert Support</span>
              </div>
              <div className="w-px h-4 bg-slate-700 hidden md:block" />
              <div className="flex items-center space-x-2 text-slate-400 text-sm hidden md:flex">
                <Zap size={16} className="text-amber-400" />
                <span>Fast Delivery</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-1.5 md:p-2 shadow-lg">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`flex items-center space-x-2 px-4 md:px-6 py-2.5 md:py-3 rounded-lg transition-all duration-200 flex-1 justify-center ${
              activeTab === 'catalog'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold shadow-lg shadow-orange-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShoppingCart size={18} />
            <span className="text-sm">Browse Services</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`flex items-center space-x-2 px-4 md:px-6 py-2.5 md:py-3 rounded-lg transition-all duration-200 flex-1 justify-center ${
              activeTab === 'orders'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold shadow-lg shadow-orange-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ClipboardList size={18} />
            <span className="text-sm">My Orders</span>
            {orders.length > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
                {orders.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'catalog' && (
        <div className="space-y-8">
          {services.length === 0 ? (
            <PremiumCard className="p-8 text-center">
              <div className="p-4 bg-slate-100 rounded-full w-fit mx-auto mb-4">
                <Package className="text-slate-400" size={32} />
              </div>
              <h4 className="text-lg font-semibold text-slate-900">
                No services available
              </h4>
              <p className="text-slate-500 mt-2">
                Professional services will appear here once configured.
              </p>
            </PremiumCard>
          ) : (
            Object.entries(groupedServices).map(
              ([serviceType, typeServices]) => (
                <div key={serviceType}>
                  <div className="flex items-center gap-3 mb-4">
                    {React.createElement(getServiceIcon(serviceType), {
                      size: 20,
                      className: 'text-orange-500',
                    })}
                    <h3 className="text-xl font-bold text-slate-900">
                      {getServiceTypeLabel(serviceType)}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {typeServices.map((service) => {
                      const Icon = getServiceIcon(service.serviceType);
                      const features = Array.isArray(service.features)
                        ? service.features
                        : [];

                      return (
                        <PremiumCard
                          key={service.id}
                          className="p-6 flex flex-col"
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div
                              className={
                                'p-3 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500'
                              }
                            >
                              <Icon className="text-white" size={24} />
                            </div>
                            <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-full">
                              {service.deliveryDays} day
                              {service.deliveryDays !== 1 ? 's' : ''} delivery
                            </span>
                          </div>

                          <h4 className="text-lg font-bold text-slate-900 mb-2">
                            {service.name}
                          </h4>
                          {service.description && (
                            <p className="text-sm text-slate-500 mb-4">
                              {service.description}
                            </p>
                          )}

                          <div className="flex items-baseline mb-4">
                            <span className="text-3xl font-extrabold text-slate-900">
                              {formatPrice(service.priceCents)}
                            </span>
                            <span className="text-slate-500 ml-1 text-sm">
                              one-time
                            </span>
                          </div>

                          {features.length > 0 && (
                            <div className="space-y-2 mb-6 flex-1">
                              {features.map((feature, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2 text-sm text-slate-600"
                                >
                                  <Check
                                    size={16}
                                    className="text-emerald-500 mt-0.5 flex-shrink-0"
                                  />
                                  <span>{feature}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => setSelectedService(service)}
                            className="w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/25"
                          >
                            <ShoppingCart size={16} />
                            Order Now
                          </button>
                        </PremiumCard>
                      );
                    })}
                  </div>
                </div>
              ),
            )
          )}
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="space-y-4">
          <PremiumCard className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Order History
                </h3>
                <p className="text-sm text-slate-500">
                  Track your service orders and delivery status
                </p>
              </div>
              <button
                type="button"
                onClick={fetchData}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>

            {orders.length === 0 ? (
              <div className="text-center py-12">
                <div className="p-4 bg-slate-100 rounded-full w-fit mx-auto mb-4">
                  <ClipboardList className="text-slate-400" size={32} />
                </div>
                <h4 className="text-lg font-semibold text-slate-900">
                  No orders yet
                </h4>
                <p className="text-slate-500 mt-2 max-w-md mx-auto">
                  When you purchase professional services, your order history
                  will appear here.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('catalog')}
                  className="mt-4 inline-flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium"
                >
                  <ShoppingCart size={16} />
                  Browse Services
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((order) => {
                  const service = getServiceById(order.serviceId);
                  const statusBadge = getStatusBadge(order.status);
                  const Icon = service
                    ? getServiceIcon(service.serviceType)
                    : Briefcase;

                  return (
                    <div
                      key={order.id}
                      className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="p-2 bg-slate-100 rounded-lg">
                            <Icon size={20} className="text-slate-600" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-slate-900">
                              {service?.name || 'Unknown Service'}
                            </h4>
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-slate-500">
                              <div className="flex items-center gap-1">
                                <Calendar size={14} />
                                <span>{formatDate(order.createdAt)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <DollarSign size={14} />
                                <span>
                                  {order.pricePaidCents
                                    ? formatPrice(order.pricePaidCents)
                                    : 'Pending'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}
                        >
                          {statusBadge.label}
                        </span>
                      </div>

                      {order.notes && (
                        <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
                            <MessageSquare size={12} />
                            Your Notes
                          </div>
                          <p className="text-sm text-slate-700">
                            {order.notes}
                          </p>
                        </div>
                      )}

                      {order.status === 'completed' && order.deliveryNotes && (
                        <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                          <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 mb-1">
                            <CheckCircle size={12} />
                            Delivery Notes
                          </div>
                          <p className="text-sm text-emerald-800">
                            {order.deliveryNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </PremiumCard>
        </div>
      )}

      {selectedService && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">
                  Confirm Order
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedService(null);
                    setOrderNotes('');
                  }}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500">
                  {React.createElement(
                    getServiceIcon(selectedService.serviceType),
                    {
                      className: 'text-white',
                      size: 24,
                    },
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900">
                    {selectedService.name}
                  </h4>
                  {selectedService.description && (
                    <p className="text-sm text-slate-500 mt-1">
                      {selectedService.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Price</span>
                  <span className="font-bold text-slate-900">
                    {formatPrice(selectedService.priceCents)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">
                    Estimated Delivery
                  </span>
                  <span className="font-medium text-slate-700">
                    {selectedService.deliveryDays} business day
                    {selectedService.deliveryDays !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {Array.isArray(selectedService.features) &&
                selectedService.features.length > 0 && (
                  <div>
                    <h5 className="text-sm font-semibold text-slate-700 mb-2">
                      Includes:
                    </h5>
                    <div className="space-y-2">
                      {selectedService.features.map((feature, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 text-sm text-slate-600"
                        >
                          <Check
                            size={16}
                            className="text-emerald-500 mt-0.5 flex-shrink-0"
                          />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Notes / Requirements (optional)
                </label>
                <textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Add any specific requirements or details for this service..."
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none text-sm"
                />
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button
                type="button"
                onClick={handleOrderSubmit}
                disabled={submitting}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader className="animate-spin" size={16} />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    Confirm Order - {formatPrice(selectedService.priceCents)}
                  </>
                )}
              </button>
              <p className="text-xs text-slate-500 text-center mt-3">
                Our team will reach out to begin working on your service
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="text-red-600" size={20} />
          <span className="text-red-800">{error}</span>
        </div>
      )}
    </div>
  );
};
