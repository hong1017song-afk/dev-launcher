import React from 'react';
import { ConfigProvider, Layout, Menu, Typography, theme } from 'antd';
import { AppstoreOutlined, SettingOutlined, ApiOutlined, RobotOutlined } from '@ant-design/icons';
import { useState } from 'react';
import ServiceDashboard from './pages/ServiceDashboard';
import AiSettingsPanel from './components/AiSettingsPanel';
import ApiInfoPanel from './components/ApiInfoPanel';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

type PageKey = 'dashboard' | 'ai-settings' | 'api-info';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageKey>('dashboard');
  const { token: themeToken } = theme.useToken();

  const menuItems = [
    { key: 'dashboard', icon: <AppstoreOutlined />, label: '服务管理' },
    { key: 'ai-settings', icon: <RobotOutlined />, label: 'AI 设置' },
    { key: 'api-info', icon: <ApiOutlined />, label: 'API 信息' },
  ];

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <ServiceDashboard />;
      case 'ai-settings':
        return <AiSettingsPanel />;
      case 'api-info':
        return <ApiInfoPanel />;
      default:
        return <ServiceDashboard />;
    }
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#00FF41',
          colorBgBase: '#0D1117',
          colorBgContainer: '#0D1117',
          colorBgElevated: '#161B22',
          colorBorder: '#30363D',
          borderRadius: 2,
          fontFamily: "'Inter', sans-serif",
          fontFamilyCode: "'Fira Code', monospace",
        },
      }}
    >
      <Layout className="cyber-bg" style={{ minHeight: '100vh' }}>
        <Sider width={220} style={{ background: 'transparent', borderRight: '1px solid var(--cyber-border)' }}>
          <div style={{ padding: '16px', textAlign: 'center' }}>
            <Title level={4} style={{ color: '#00FF41', margin: 0, textShadow: '0 0 5px rgba(0, 255, 65, 0.5)', fontFamily: "'Fira Code', monospace" }}>
              Dev Launcher
            </Title>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[currentPage]}
            items={menuItems}
            onClick={({ key }) => setCurrentPage(key as PageKey)}
            style={{ borderInlineEnd: 'none' }}
          />
        </Sider>
        <Layout>
          <Content style={{ padding: '24px', overflow: 'auto' }}>
            {renderPage()}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
