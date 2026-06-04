import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Select, Button, Typography, Alert, Space, Divider, Tag } from 'antd';
import { RobotOutlined, SaveOutlined, KeyOutlined } from '@ant-design/icons';
import type { AiSettings, AiProvider } from '../../main/shared/types';

const { Title, Text, Paragraph } = Typography;

const modelOptions: Record<AiProvider, { label: string; value: string }[]> = {
  deepseek: [
    { label: 'DeepSeek V4 Pro', value: 'deepseek-v4-pro' },
    { label: 'DeepSeek V4 Flash', value: 'deepseek-v4-flash' },
    { label: 'DeepSeek-Chat (V3)', value: 'deepseek-chat' },
    { label: 'DeepSeek-Reasoner (R1)', value: 'deepseek-reasoner' },
  ],
  openai: [
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'GPT-4o-mini', value: 'gpt-4o-mini' },
    { label: 'GPT-4-turbo', value: 'gpt-4-turbo' },
  ],
};

const providerOptions: { label: string; value: AiProvider }[] = [
  { label: 'DeepSeek（推荐）', value: 'deepseek' },
  { label: 'OpenAI', value: 'openai' },
];

const providerHints: Record<AiProvider, { envVar: string; placeholder: string; apiBase: string }> = {
  deepseek: {
    envVar: 'DEEPSEEK_API_KEY',
    placeholder: 'sk-... (留空则从环境变量 DEEPSEEK_API_KEY 读取)',
    apiBase: 'https://api.deepseek.com',
  },
  openai: {
    envVar: 'OPENAI_API_KEY',
    placeholder: 'sk-... (留空则从环境变量 OPENAI_API_KEY 读取)',
    apiBase: 'https://api.openai.com',
  },
};

const AiSettingsPanel: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [provider, setProvider] = useState<AiProvider>('deepseek');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await window.electronAPI.ai.getSettings();
      setProvider(settings.provider);
      form.setFieldsValue({
        provider: settings.provider,
        model: settings.model || getDefaultModel(settings.provider),
        apiKey: settings.apiKey || '',
      });
      const ready = await window.electronAPI.ai.isInitialized();
      setInitialized(ready);
    } catch {
      // ignore
    }
  };

  const getDefaultModel = (p: AiProvider) => modelOptions[p][0].value;

  const handleProviderChange = (val: AiProvider) => {
    setProvider(val);
    form.setFieldValue('model', getDefaultModel(val));
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const settings: AiSettings = {
        provider: values.provider,
        model: values.model,
        allowRepairExecution: 'approval-required',
        apiKey: values.apiKey || '',
      };

      const result = await window.electronAPI.ai.updateSettings(settings);
      if (result.success) {
        setSaved(true);
        setInitialized(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // validation error
    } finally {
      setLoading(false);
    }
  };

  const hint = providerHints[provider];

  return (
    <div style={{ maxWidth: 600 }}>
      <Title level={3}>
        <RobotOutlined /> AI 设置
      </Title>

      <Alert
        type="info"
        message="API Key 安全说明"
        description={`API Key 优先从环境变量 ${hint.envVar} 读取。如果填写在下方，会保存在本地配置文件中（不写入日志）。`}
        style={{ marginBottom: 24 }}
      />

      <Card>
          <Form form={form} layout="vertical" initialValues={{ provider: 'deepseek', model: 'deepseek-v4-pro' }}>
          <Form.Item name="provider" label="AI 提供商">
            <Select
              options={providerOptions}
              onChange={handleProviderChange}
            />
          </Form.Item>

          <Form.Item name="model" label="模型" rules={[{ required: true }]}>
            <Select options={modelOptions[provider]} />
          </Form.Item>

          <Form.Item
            name="apiKey"
            label={
              <Space>
                <KeyOutlined />
                <span>API Key</span>
              </Space>
            }
          >
            <Input.Password
              placeholder={hint.placeholder}
              visibilityToggle
            />
          </Form.Item>

          <Paragraph type="secondary" style={{ fontSize: 12 }}>
            API 端点: <code>{hint.apiBase}</code>
          </Paragraph>

          <Divider />

          <Space>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={loading}
            >
              保存设置
            </Button>
            {saved && <Text type="success">设置已保存</Text>}
            {initialized && (
              <Tag color="green">AI 已就绪</Tag>
            )}
          </Space>
        </Form>
      </Card>

      <Card title="诊断说明" style={{ marginTop: 16 }}>
        <Paragraph type="secondary">
          AI 排障功能会收集服务的配置、状态、日志和项目文件信息，发送给所选 AI 提供商进行分析。
          所有修复动作都需要用户在界面中确认后才能执行。
          高风险命令不会提供一键执行选项。
        </Paragraph>
      </Card>
    </div>
  );
};

export default AiSettingsPanel;
