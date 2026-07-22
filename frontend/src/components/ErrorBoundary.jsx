// =====================================================
// ErrorBoundary — Catches render errors, shows fallback
// Without this, any component crash = blank white page
// =====================================================
import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#080c14',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '16px',
          padding: '32px',
          fontFamily: 'monospace',
          color: '#e8f0fe',
        }}>
          <div style={{ fontSize: '40px' }}>⚠️</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ef4444' }}>
            Something went wrong
          </div>
          <div style={{
            background: '#141c2e',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: '8px',
            padding: '16px 24px',
            maxWidth: '600px',
            width: '100%',
            fontSize: '12px',
            color: '#f59e0b',
            wordBreak: 'break-all',
          }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '8px',
              padding: '10px 24px',
              background: '#3b9eff',
              border: 'none',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
