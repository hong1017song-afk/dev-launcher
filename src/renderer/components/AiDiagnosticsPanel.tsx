import React, { useState, useEffect } from 'react';
import { Modal, Card, Tag, Button, Space, Typography, Alert, Spin, List, Collapse, Switch } from 'antd';
import {
  BugOutlined,
  CheckOutlined,
  CloseOutlined,
  WarningOutlined,
  RightOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { DiagnoseResult, RepairAction } from '../../main/shared/types';

const { Text, Title, Paragraph } = Typography;

interface AiDiagnosticsPanelProps {
  serviceId: string | null;
  open: boolean;
  onClose: () => void;
  onRefreshServices: () => void;
}

const riskColors: Record<string, string> = { low: 'green', medium: 'orange', high: 'red' };
const riskLabels: Record<string, string> = { low: '低风险', medium: '中风险', high: '高风险' };
const actionTypeLabels: Record<string, string> = {
  'run-command': '运行命令',
  'edit-file': '编辑文件',
  'open-file': '打开文件',
  'restart-service': '重启服务',
};

interface ActionResult {
  success: boolean;
  output: string;
  durationMs?: number;
}

const AiDiagnosticsPanel: React.FC<AiDiagnosticsPanelProps> = ({
  serviceId,
  open,
  onClose,
  onRefreshServices,
}) => {
  const [diagnosing, setDiagnosing] = useState(false);
  const [result, setResult] = useState<DiagnoseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executingActions, setExecutingActions] = useState<Set<string>>(new Set());
  const [executionResults, setExecutionResults] = useState<Map<string, ActionResult>>(new Map());
  const [aiReady, setAiReady] = useState(false);
  const [confirmAction, setConfirmAction] = useState<RepairAction | null>(null);

  useEffect(() => {
    if (open) window.electronAPI.ai.isInitialized().then(setAiReady);
  }, [open]);

  useEffect(() => {
    if (open && serviceId) {
      setResult(null);
      setError(null);
      setExecutingActions(new Set());
      setExecutionResults(new Map());
      setConfirmAction(null);
    }
  }, [open, serviceId]);

  const handleDiagnose = async () => {
    if (!serviceId) return;
    setDiagnosing(true);
    setError(null);
    setResult(null);
    try {
      const data = await window.electronAPI.ai.createRepairPlan(serviceId);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '诊断失败');
    } finally {
      setDiagnosing(false);
    }
  };

  const handleConfirmExecute = async (action: RepairAction) => {
    setConfirmAction(null);
    setExecutingActions((prev) => new Set(prev).add(action.id));
    try {
      const res = await window.electronAPI.ai.executeRepairAction(action);
      setExecutionResults((prev) => {
        const next = new Map(prev);
        next.set(action.id, res);
        return next;
      });
      if (action.type === 'restart-service') {
        onRefreshServices();
      }
      setTimeout(onRefreshServices, 1500);
    } catch (err: unknown) {
      setExecutionResults((prev) => {
        const next = new Map(prev);
        next.set(action.id, {
          success: false,
          output: err instanceof Error ? err.message : '未知错误',
        });
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

  const renderActionResult = (actionId: string) => {
    const res = executionResults.get(actionId);
    if (!res) return null;
    const icon = res.success ? (
      <CheckOutlined style={{ color: '#52c41a' }} />
    ) : (
      <CloseOutlined style={{ color: '#ff4d4f' }} />
    );
    return (
      <Alert
        type={res.success ? 'success' : 'error'}
        icon={icon}
        message={
          <Space>
            <span>{res.success ? '执行成功' : '执行失败'}</span>
            {res.durationMs !== undefined && (
              <Tag icon={<ClockCircleOutlined />} style={{ fontSize: 11 }}>
                {res.durationMs < 1000
                  ? `${res.durationMs}ms`
                  : `${(res.durationMs / 1000).toFixed(1)}s`}
              </Tag>
            )}
          </Space>
        }
        description={
          <pre
            style={{
              fontSize: 11,
              margin: 0,
              background: '#1a1a2e',
              padding: 8,
              borderRadius: 4,
              color: '#e0e0e0',
              maxHeight: 200,
              overflow: 'auto',
            }}
          >
            {res.output || '(无输出)'}
          </pre>
        }
        style={{ marginTop: 8 }}
      />
    );
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
      width={750}
      destroyOnClose
    >
      {!aiReady && (
        <Alert
          type="warning"
          message="AI 未配置"
          description="请先在 AI 设置页配置 API Key（DeepSeek 或 OpenAI），Key 可从环境变量读取。"
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

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} closable />}

      {diagnosing && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin size="large" />
          <Paragraph type="secondary" style={{ marginTop: 16 }}>
            AI 正在分析服务状态、日志和配置...
          </Paragraph>
        </div>
      )}

      {result && !diagnosing && (
        <>
          {result.repairActions.length === 0 && result.rawResponse.length > 2 ? (
            <Alert
              type="info"
              message="所有修复动作已被安全过滤（仅保留低风险操作）"
              style={{ marginBottom: 16 }}
            />
          ) : null}

          <Collapse
            defaultActiveKey={['issues', 'suggestions', 'actions']}
            items={[
              {
                key: 'issues',
                label: <Text strong>发现的问题 ({result.issues.length})</Text>,
                children:
                  result.issues.length > 0 ? (
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
                children:
                  result.repairActions.length > 0 ? (
                    <List
                      size="small"
                      dataSource={result.repairActions}
                      renderItem={(action) => {
                        const isExecuting = executingActions.has(action.id);
                        const hasResult = executionResults.has(action.id);
                        return (
                          <List.Item
                            actions={[
                              <Button
                                key="exec"
                                type="primary"
                                size="small"
                                icon={<RightOutlined />}
                                loading={isExecuting}
                                onClick={() => setConfirmAction(action)}
                                danger={action.risk === 'high'}
                                disabled={hasResult}
                              >
                                {hasResult ? '已执行' : '执行'}
                              </Button>,
                            ]}
                          >
                            <List.Item.Meta
                              title={
                                <Space>
                                  <Tag color={riskColors[action.risk]}>
                                    {riskLabels[action.risk]}
                                  </Tag>
                                  <Text>{action.title}</Text>
                                  <Tag>{actionTypeLabels[action.type] || action.type}</Tag>
                                </Space>
                              }
                              description={
                                <div>
                                  <Text type="secondary">{action.explanation}</Text>
                                  {action.command && (
                                    <pre
                                      style={{
                                        fontSize: 11,
                                        marginTop: 4,
                                        background: '#1a1a2e',
                                        padding: 4,
                                        borderRadius: 4,
                                        color: '#e0e0e0',
                                      }}
                                    >
                                      {action.command}
                                    </pre>
                                  )}
                                  {action.patchPreview && (
                                    <pre
                                      style={{
                                        fontSize: 11,
                                        marginTop: 4,
                                        background: '#1a1a2e',
                                        padding: 4,
                                        borderRadius: 4,
                                        color: '#e0e0e0',
                                      }}
                                    >
                                      {action.patchPreview}
                                    </pre>
                                  )}
                                  {renderActionResult(action.id)}
                                </div>
                              }
                            />
                          </List.Item>
                        );
                      }}
                    />
                  ) : (
                    <Text type="secondary">无可用修复动作（所有动作已被安全过滤）</Text>
                  ),
              },
            ]}
          />
        </>
      )}

      <Modal
        title={<Space><ExclamationCircleOutlined /><span>确认执行修复动作</span></Space>}
        open={confirmAction !== null}
        onCancel={() => setConfirmAction(null)}
        onOk={() => confirmAction && handleConfirmExecute(confirmAction)}
        okText="确认执行"
        cancelText="取消"
        width={550}
      >
        {confirmAction && (
          <div>
            <Paragraph>
              <Text strong>动作: </Text>
              {confirmAction.title}
            </Paragraph>
            <Paragraph>
              <Text strong>类型: </Text>
              <Tag>{actionTypeLabels[confirmAction.type]}</Tag>
              <Tag color={riskColors[confirmAction.risk]}>{riskLabels[confirmAction.risk]}</Tag>
            </Paragraph>
            {confirmAction.command && (
              <Paragraph>
                <Text strong>命令:</Text>
                <pre
                  style={{
                    fontSize: 12,
                    background: '#1a1a2e',
                    padding: 8,
                    borderRadius: 4,
                    color: '#e0e0e0',
                    marginTop: 4,
                  }}
                >
                  {confirmAction.command}
                </pre>
              </Paragraph>
            )}
            {confirmAction.cwd && (
              <Paragraph>
                <Text strong>工作目录: </Text>
                <code>{confirmAction.cwd}</code>
              </Paragraph>
            )}
            <Paragraph>
              <Text strong>说明: </Text>
              {confirmAction.explanation}
            </Paragraph>
            <Alert
              type="warning"
              message="请确认以上操作安全后再执行。所有命令都在服务目录内执行，高风险命令已被系统过滤。"
              style={{ marginTop: 12 }}
            />
          </div>
        )}
      </Modal>
    </Modal>
  );
};

export default AiDiagnosticsPanel;
