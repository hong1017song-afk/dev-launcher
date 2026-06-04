import React, { useState, useEffect } from 'react';
import { Card, Typography, Descriptions, Button, Tag, Alert, Space, Input } from 'antd';
import { CopyOutlined, ApiOutlined, KeyOutlined, ReloadOutlined } from '@ant-design/icons';
import type { TokenInfo } from '../../main/shared/types';

const { Title, Text, Paragraph } = Typography;

const ApiInfoPanel: React.FC = () => {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [apiStatus, setApiStatus] = useState<{ version: string; serviceCount: number } | null>(null);

  useEffect(() => {
    loadInfo();
  }, []);

  const loadInfo = async () => {
    try {
      const info = await window.electronAPI.app.getTokenInfo();
      setTokenInfo(info);
    } catch { /* ignore */ }
    try {
      const status = await window.electronAPI.app.getStatus();
      setApiStatus(status);
    } catch { /* ignore */ }
  };

  const handleCopyToken = () => {
    if (tokenInfo?.token) {
      navigator.clipboard.writeText(tokenInfo.token);
    }
  };

  const apiBaseUrl = 'http://127.0.0.1:19527';

  return (
    <div style={{ maxWidth: 700 }}>
      <Title level={3}>
        <ApiOutlined /> API 信息
      </Title>

      <Alert
        type="info"
        message="本地 API 端点"
        description={`API 仅监听 127.0.0.1，所有接口（除 /api/status 和 /api/openapi.json）需要 Bearer token 鉴权。`}
        style={{ marginBottom: 24 }}
      />

      <Card title={<Space><KeyOutlined /><span>访问令牌</span></Space>} style={{ marginBottom: 16 }}>
        {tokenInfo && (
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Token">
              <Space>
                <Input.Password
                  value={tokenInfo.token}
                  readOnly
                  style={{ width: 380, fontFamily: 'monospace', fontSize: 12 }}
                />
                <Button
                  icon={<CopyOutlined />}
                  size="small"
                  onClick={handleCopyToken}
                >
                  复制
                </Button>
                <Button
                  icon={<ReloadOutlined />}
                  size="small"
                  onClick={loadInfo}
                />
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {tokenInfo.createdAt ? new Date(tokenInfo.createdAt).toLocaleString() : '未知'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card title="API 端点" style={{ marginBottom: 16 }}>
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Base URL">
            <code>{apiBaseUrl}</code>
          </Descriptions.Item>
          <Descriptions.Item label="OpenAPI 文档">
            <code>{apiBaseUrl}/api/openapi.json</code>
          </Descriptions.Item>
          <Descriptions.Item label="状态检查">
            <code>{apiBaseUrl}/api/status</code>
          </Descriptions.Item>
          <Descriptions.Item label="服务列表">
            <code>GET {apiBaseUrl}/api/services</code>
          </Descriptions.Item>
          <Descriptions.Item label="注册服务">
            <code>POST {apiBaseUrl}/api/services/register-from-file</code>
          </Descriptions.Item>
          <Descriptions.Item label="AI 诊断">
            <code>POST {apiBaseUrl}/api/ai/services/{"{id}"}/diagnose</code>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="使用方式" style={{ marginBottom: 16 }}>
        <Paragraph>
          <Text strong>Bearer Token 鉴权：</Text>
        </Paragraph>
        <pre style={{ background: '#1a1a2e', padding: 12, borderRadius: 6, fontSize: 12, color: '#e0e0e0' }}>
{`curl -H "Authorization: Bearer <token>" \\
  ${apiBaseUrl}/api/services
`}</pre>

        <Paragraph style={{ marginTop: 16 }}>
          <Text strong>注册服务文件示例 (dev-launcher.service.json)：</Text>
        </Paragraph>
        <pre style={{ background: '#1a1a2e', padding: 12, borderRadius: 6, fontSize: 12, color: '#e0e0e0' }}>
{`{
  "id": "my-cli-tool",
  "name": "我的 CLI 工具",
  "group": "Agent Tools",
  "kind": "cli",
  "cwd": "/absolute/path/to/my-cli-tool",
  "command": "pnpm start",
  "runMode": "external-terminal",
  "terminal": {
    "mode": "default",
    "keepOpen": true
  },
  "enabled": true,
  "source": "agent",
  "tags": ["cli", "agent"]
}
`}</pre>

        <Paragraph style={{ marginTop: 16 }}>
          <Text strong>注册命令：</Text>
        </Paragraph>
        <pre style={{ background: '#1a1a2e', padding: 12, borderRadius: 6, fontSize: 12, color: '#e0e0e0' }}>
{`curl -X POST \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"filePath":"/absolute/path/to/dev-launcher.service.json"}' \\
  ${apiBaseUrl}/api/services/register-from-file
`}</pre>
      </Card>
    </div>
  );
};

export default ApiInfoPanel;
