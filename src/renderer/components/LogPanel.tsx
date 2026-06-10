import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Space, Typography, Empty, Input, Spin, Alert, Switch, Badge } from 'antd';
import { ReloadOutlined, ClearOutlined, DownloadOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface LogPanelProps {
  serviceId: string | null;
  open: boolean;
  onClose: () => void;
}

const LogPanel: React.FC<LogPanelProps> = ({ serviceId, open, onClose }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open && serviceId) {
      setError(null);
      fetchLogs();
      timerRef.current = setInterval(fetchLogs, 2000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [open, serviceId]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const fetchLogs = async () => {
    if (!serviceId) return;
    setLoading(true);
    try {
      const data = await window.electronAPI.services.getLogs(serviceId);
      setLogs(data);
      setError(null);
      setLastRefresh(new Date());
    } catch {
      setError('无法读取日志文件');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (logs.length === 0) return;
    const content = logs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${serviceId}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredLogs = filter ? logs.filter((line) => line.toLowerCase().includes(filter.toLowerCase())) : logs;
  const hasLogs = logs.length > 0;
  const filteredCount = filter ? filteredLogs.length : 0;

  return (
    <Modal
      title={
        <Space>
          <span>服务日志: {serviceId}</span>
          {lastRefresh && <Badge status="processing" text={`上次刷新: ${lastRefresh.toLocaleTimeString()}`} />}
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
    >
      <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <Button icon={<ReloadOutlined />} onClick={fetchLogs} size="small" loading={loading}>
          刷新
        </Button>
        <Button
          icon={<DownloadOutlined />}
          onClick={handleExport}
          size="small"
          disabled={!hasLogs}
        >
          导出
        </Button>
        <Button
          icon={<ClearOutlined />}
          onClick={() => setFilter('')}
          size="small"
          disabled={!filter}
        >
          清空筛选
        </Button>
        <Input
          placeholder="过滤日志..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 200 }}
          size="small"
          allowClear
        />
        <Space size={4}>
          <Text type="secondary" style={{ fontSize: 12 }}>自动滚动:</Text>
          <Switch
            size="small"
            checked={autoScroll}
            onChange={setAutoScroll}
            checkedChildren={<VerticalAlignBottomOutlined />}
          />
        </Space>
        {loading && <Spin size="small" />}
        {filter && <Text type="secondary" style={{ fontSize: 12 }}>匹配 {filteredCount}/{logs.length} 行</Text>}
      </Space>

      <div
        ref={containerRef}
        style={{
          background: '#000000',
          color: '#e0e0e0',
          padding: 12,
          borderRadius: 2,
          height: 420,
          overflow: 'auto',
          fontFamily: "'Fira Code', monospace",
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {error ? (
          <Alert
            type="error"
            message="日志读取失败"
            description={error}
            showIcon
            style={{ margin: '40px auto', maxWidth: 400 }}
            action={
              <Button size="small" onClick={fetchLogs}>
                重试
              </Button>
            }
          />
        ) : loading && !hasLogs ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: '#888' }}>加载日志中...</div>
          </div>
        ) : filteredLogs.length === 0 ? (
          filter ? (
            <Empty description="没有匹配的日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Empty description="暂无日志，启动服务后将出现日志输出" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )
        ) : (
          filteredLogs.map((line, i) => {
            const isError = line.includes('[ERR]') || line.includes('[ERROR]');
            const isExit = line.includes('[EXIT]');
            const isLifecycle = line.includes('[LIFECYCLE]');
            return (
              <div
                key={i}
                style={{
                  color: isError ? '#ff4d4f' : isExit ? '#faad14' : isLifecycle ? '#52c41a' : '#e0e0e0',
                }}
              >
                {line}
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
};

export default LogPanel;
