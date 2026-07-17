import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';
import { io } from 'socket.io-client';

const AuthContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
      initializeSocket(token);
    }
    setLoading(false);
  }, []);

  const initializeSocket = (token) => {
    const newSocket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket connected:', newSocket.id);
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
    });

    setSocket(newSocket);

    return newSocket;
  };

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { data, mfaRequired, userId } = response.data;

    if (mfaRequired) {
      return { mfaRequired: true, userId };
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
    initializeSocket(data.token);

    return { success: true, user: data };
  };

  const verifyMFA = async (userId, token) => {
    const response = await api.post('/auth/verify-mfa', { userId, token });
    const { data } = response.data;

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
    initializeSocket(data.token);

    return { success: true, user: data };
  };

  const register = async (name, email, password, role) => {
    const response = await api.post('/auth/register', { name, email, password, role });
    const { data } = response.data;

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data));
    setUser(data);
    initializeSocket(data.token);

    return { success: true, user: data };
  };

  const logout = () => {
    if (socket) {
      socket.disconnect();
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setSocket(null);
  };

  const setupMFA = async () => {
    const response = await api.get('/auth/mfa/setup');
    return response.data;
  };

  const enableMFA = async (token) => {
    const response = await api.post('/auth/mfa/enable', { token });
    if (response.data.success) {
      const updatedUser = { ...user, mfaEnabled: true };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
    return response.data;
  };

  const disableMFA = async (token) => {
    const response = await api.post('/auth/mfa/disable', { token });
    if (response.data.success) {
      const updatedUser = { ...user, mfaEnabled: false };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
    return response.data;
  };

  const joinTicketRoom = (ticketId) => {
    if (socket) {
      socket.emit('join_ticket', ticketId);
    }
  };

  const leaveTicketRoom = (ticketId) => {
    if (socket) {
      socket.emit('leave_ticket', ticketId);
    }
  };

  const onTicketUpdate = (callback) => {
    if (socket) {
      socket.on('ticket_updated', callback);
      return () => socket.off('ticket_updated', callback);
    }
  };

  const onNewTicket = (callback) => {
    if (socket) {
      socket.on('new_ticket', callback);
      return () => socket.off('new_ticket', callback);
    }
  };

  const value = {
    user,
    loading,
    socket,
    login,
    verifyMFA,
    register,
    logout,
    setupMFA,
    enableMFA,
    disableMFA,
    joinTicketRoom,
    leaveTicketRoom,
    onTicketUpdate,
    onNewTicket
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
