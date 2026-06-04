import React, { useState } from 'react';
import { Modal, Form, Input, InputNumber, Select, Switch, Button, Space } from 'antd';
import type { DevService, ServiceKind, RunMode, ServiceSource } from '../../main/shared/types';
import BrowserSelector from './BrowserSelector';

interface ServiceFormProps {
  open: boolean;
  initialValues?: DevService;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

const ServiceForm: React.FC<ServiceFormProps> = ({ open, initialValues, onSubmit, onCancel }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [runMode, setRunMode] = useState<RunMode>(initialValues?.runMode || 'managed-process');

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const data: Record<string, unknown> = {
        id: values.id,
        name: values.name,
        group: values.group || 'Default',
        kind: values.kind,
        cwd: values.cwd,
        command: values.command,
        runMode: values.runMode,
        port: values.port || undefined,
        openUrl: values.openUrl || undefined,
        healthCheckUrl: values.healthCheckUrl || undefined,
        env: {},
        dependsOn: values.dependsOn || [],
        enabled: values.enabled !== false,
        source: values.source,
        description: values.description || undefined,
        tags: values.tags || [],
      };

      if (values.browserMode === 'specific') {
        data.browser = { mode: 'specific', browserId: values.browserId };
      } else {
        data.browser = { mode: 'default' };
      }

      if (values.runMode === 'external-terminal') {
        data.terminal = {
          mode: values.terminalMode || 'default',
          appId: values.terminalAppId || undefined,
          keepOpen: values.terminalKeepOpen !== false,
        };
      }

      await onSubmit(data);
    } catch {
      // validation error
    } finally {
      setSubmitting(false);
    }
  };

  React.useEffect(() => {
    if (open && initialValues) {
      form.setFieldsValue({
        ...initialValues,
        browserMode: initialValues.browser?.mode || 'default',
        browserId: initialValues.browser?.browserId || undefined,
        terminalMode: initialValues.terminal?.mode || 'default',
        terminalAppId: initialValues.terminal?.appId || undefined,
        terminalKeepOpen: initialValues.terminal?.keepOpen !== false,
      });
    } else if (open) {
      form.resetFields();
      form.setFieldsValue({
        group: 'Default',
        kind: 'web',
        runMode: 'managed-process',
        source: 'manual',
        enabled: true,
      });
    }
  }, [open, initialValues, form]);

  return (
    <Modal
      title={initialValues ? '编辑服务' : '添加服务'}
      open={open}
      onOk={handleSubmit}
      onCancel={onCancel}
      confirmLoading={submitting}
      width={640}
      destroyOnClose
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Form.Item name="id" label="ID" rules={[{ required: true, message: '请输入服务 ID' }]}>
          <Input placeholder="例如: my-web-app" disabled={!!initialValues} />
        </Form.Item>

        <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入服务名称' }]}>
          <Input placeholder="例如: Oldsix" />
        </Form.Item>

        <Form.Item name="group" label="分组" initialValue="Default">
          <Input placeholder="例如: Development" />
        </Form.Item>

        <Space style={{ width: '100%' }} size="middle">
          <Form.Item name="kind" label="类型" rules={[{ required: true }]} style={{ width: 200 }}>
            <Select
              options={[
                { label: 'Web', value: 'web' },
                { label: 'API', value: 'api' },
                { label: '数据库', value: 'database' },
                { label: 'Redis', value: 'redis' },
                { label: 'Docker Compose', value: 'docker-compose' },
                { label: 'CLI', value: 'cli' },
                { label: '自定义', value: 'custom' },
              ]}
            />
          </Form.Item>

          <Form.Item name="source" label="来源" rules={[{ required: true }]} style={{ width: 150 }}>
            <Select
              options={[
                { label: '手动', value: 'manual' },
                { label: 'API', value: 'api' },
                { label: 'Agent', value: 'agent' },
              ]}
            />
          </Form.Item>
        </Space>

        <Form.Item name="cwd" label="工作目录" rules={[{ required: true, message: '请输入工作目录' }]}>
          <Input placeholder="例如: /absolute/path/to/my-web-app" />
        </Form.Item>

        <Form.Item name="command" label="启动命令" rules={[{ required: true, message: '请输入启动命令' }]}>
          <Input placeholder="例如: pnpm start" />
        </Form.Item>

        <Form.Item name="runMode" label="运行模式" rules={[{ required: true }]}>
          <Select
            onChange={(val) => setRunMode(val)}
            options={[
              { label: '托管进程 (可追踪状态和日志)', value: 'managed-process' },
              { label: '外部终端 (新窗口运行)', value: 'external-terminal' },
            ]}
          />
        </Form.Item>

        {runMode === 'external-terminal' && (
          <>
            <Space size="middle">
              <Form.Item name="terminalMode" label="终端模式" initialValue="default">
                <Select
                  style={{ width: 150 }}
                  options={[
                    { label: '系统默认', value: 'default' },
                    { label: '指定终端', value: 'specific' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="terminalAppId" label="终端应用">
                <Input placeholder="terminal / iterm" style={{ width: 150 }} />
              </Form.Item>
              <Form.Item name="terminalKeepOpen" label="保持打开" valuePropName="checked" initialValue={true}>
                <Switch />
              </Form.Item>
            </Space>
          </>
        )}

        <Space size="middle">
          <Form.Item name="port" label="端口">
            <InputNumber placeholder="例如: 3000" min={1} max={65535} />
          </Form.Item>

          <Form.Item name="openUrl" label="访问 URL">
            <Input placeholder="例如: http://127.0.0.1:3000" style={{ width: 280 }} />
          </Form.Item>
        </Space>

        <Form.Item name="healthCheckUrl" label="健康检查 URL">
          <Input placeholder="例如: http://127.0.0.1:3000/health" />
        </Form.Item>

        <Form.Item name="browserMode" label="浏览器" initialValue="default">
          <BrowserSelector />
        </Form.Item>

        <Form.Item name="dependsOn" label="依赖服务 ID（逗号分隔）">
          <Select mode="tags" placeholder="输入依赖的服务 ID" />
        </Form.Item>

        <Form.Item name="tags" label="标签">
          <Select mode="tags" placeholder="输入标签" />
        </Form.Item>

        <Form.Item name="enabled" label="启用" valuePropName="checked" initialValue={true}>
          <Switch />
        </Form.Item>

        <Form.Item name="description" label="描述">
          <Input.TextArea rows={2} placeholder="服务描述" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default ServiceForm;
