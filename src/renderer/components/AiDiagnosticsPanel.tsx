import React, { useState, useEffect } from 'react';
import { Modal, Card, Tag, Button, Space, Typography, Alert, Spin, List, Collapse } from 'antd';
import { BugOutlined, CheckOutlined, CloseOutlined, WarningOutlined, RightOutlined } from '@ant-design/icons';
import type { DiagnoseResult, RepairAction } from '../../main/shared/types';

const { Text, Title, Paragraph } = Typography;

interface AiDiagnosticsPanelProps {
  serviceId: string | null;
  open: boolean;
  onClose: () => void;
  onRefreshServices: () => void;
}

const riskColors: Record<string, string> = {
  low: 'green',
  medium: 'orange',
  high: 'red',
};

const riskLabels: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
};

const actionTypeLabels: Record<string, string> = {
  'run-command': '运行命令',
  'edit-file': '编辑文件',
  'open-file': '打开文件',
  'restart-service': '重启服务',
};

const AiDiagnosticsPanel: React.FC<AiDiagnosticsPanelProps> = ({ serviceId, open, onClose, onRefreshServices }) => {
  const [diagnosing, setDiagnosing] = useState(false);
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executingActions, setExecutingActions] = useState<Set<string>>(new Set());
  const [executionResults, setExecutionResults] = useState<Map<string, string>>(new Map());
  const [aiReady, setAiReady] = useState(false);

  useEffect(() => {
    if (open) {
      window.electronAPI.ai.isInitialized().then(setAiReady);
    }
  }, [open]);

  useEffect(() => {
    if (open && serviceId) {
      setResult(null);
      setError(null);
      setExecutingActions(new Set());
      setExecutionResults(new Map());
    }
  }, [open, serviceId]);

  const handleDiagnose = async () => {
    if (!serviceId) return;
    setDiagnosing(true);
    setError(null);
    setResult(null);
    try {
      const data = await window.electronAPI.ai.diagnoseService(serviceId);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '诊断失败');
    } finally {
      setDiagnosing(false);
    }
  };

  const handleExecuteAction = async (action: RepairAction) => {
    setExecutingActions((prev) => new Set(prev).add(action.id));
    try {
      const res = await window.electronAPI.ai.executeRepairAction(action);
      setExecutionResults((prev) => {
        const next = new Map(prev);
        next.set(action.id, res.success ? `成功: ${res.output}` : `失败: ${res.output}`);
        return next;
      });
      if (action.type === 'restart-service') {
        onRefreshServices();
      }
    } catch (err: unknown) {
      setExecutionResults((prev) => {
        const next = new Map(prev);
        next.set(action.id, `错误: ${err instanceof Error ? err.message : '未知错误'}`);
        return next;
      });
    } finally {
      setExecutingActions((prev) => {
        const next = new Set(prev);
        next.delete(action.id);
        return next;
      });
    }
  };

  return (
    <Modal
      title={
        <Space>
          <BugOutlined />
          <span>AI 诊断: {serviceId}</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={700}
      destroyOnClose
    >
      {!aiReady && (
        <Alert
          type="warning"
          message="AI 未配置"
          description="请先在 AI 设置页配置 OpenAI API Key（设置环境变量 OPENAI_API_KEY 或在 AI 设置中配置）。"
          style={{ marginBottom: 16 }}
        />
      )}

      <Button
        type="primary"
        icon={<BugOutlined />}
        onClick={handleDiagnose}
        loading={diagnosing}
        disabled={!aiReady}
        block
        style={{ marginBottom: 16 }}
      >
        AI 排查
      </Button>

      {error && (
        <Alert type="error" message={error} style={{ marginBottom: 16 }} closable />
      )}

      {diagnosing && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin size="large" />
          <Paragraph type="secondary" style={{ marginTop: 16 }}>
            AI 正在分析服务状态、日志和配置...
          </Paragraph>
        </div>
      )}

      {result && (
        <Collapse
          defaultActiveKey={['issues', 'suggestions', 'actions']}
          items={[
            {
              key: 'issues',
              label: <Text strong>发现的问题 ({result.issues.length})</Text>,
              children: result.issues.length > 0 ? (
                <List
                  size="small"
                  dataSource={result.issues}
                  renderItem={(item) => (
                    <List.Item>
                      <WarningOutlined style={{ color: '#faad14', marginRight: 8 }} />
                      {item}
                    </List.Item>
                  )}
                />
              ) : (
                <Text type="success">未发现明显问题</Text>
              ),
            },
            {
              key: 'causes',
              label: <Text>可能原因 ({result.possibleCauses.length})</Text>,
              children: (
                <List
                  size="small"
                  dataSource={result.possibleCauses}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              ),
            },
            {
              key: 'suggestions',
              label: <Text>建议 ({result.suggestions.length})</Text>,
              children: (
                <List
                  size="small"
                  dataSource={result.suggestions}
                  renderItem={(item) => <List.Item>{item}</List.Item>}
                />
              ),
            },
            {
              key: 'actions',
              label: (
                <Text strong style={{ color: '#1677ff' }}>
                  修复动作 ({result.repairActions.length})
                </Text>
              ),
              children: result.repairActions.length > 0 ? (
                <List
                  size="small"
                  dataSource={result.repairActions}
                  renderItem={(action) => (
                    <List.Item
                      actions={[
                        <Button
                          key="exec"
                          type="primary"
                          size="small"
                          icon={<RightOutlined />}
                          loading={executingActions.has(action.id)}
                          onClick={() => handleExecuteAction(action)}
                          danger={action.risk === 'high'}
                        >
                          执行
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            <Tag color={riskColors[action.risk]}>{riskLabels[action.risk]}</Tag>
                            <Text>{action.title}</Text>
                            <Tag>{actionTypeLabels[action.type] || action.type}</Tag>
                          </Space>
                        }
                        description={
                          <div>
                            <Text type="secondary">{action.explanation}</Text>
                            {action.command && (
                              <pre style={{ fontSize: 11, marginTop: 4, background: '#1a1a2e', padding: 4, borderRadius: 4, color: '#e0e0e0' }}>
                                {action.command}
                              </pre>
                            )}
                            {action.patchPreview && (
                              <pre style={{ fontSize: 11, marginTop: 4, background: '#1a1a2e', padding: 4, borderRadius: 4, color: '#e0e0e0' }}>
                                {action.patchPreview}
                              </pre>
                            )}
                            {executionResults.has(action.id) && (
                              <Alert
                                type={executionResults.get(action.id)?.startsWith('成功') ? 'success' : 'error'}
                                message={executionResults.get(action.id)}
                                style={{ marginTop: 8 }}
                              />
                            )}
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Text type="secondary">无可用修复动作</Text>
              ),
            },
          ]}
        />
      )}
    </Modal>
  );
};

export default AiDiagnosticsPanel;
