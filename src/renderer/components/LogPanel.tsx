import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Space, Typography, Empty, Input } from 'antd';
import { ReloadOutlined, ClearOutlined, DownloadOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface LogPanelProps {
  serviceId: string | null;
  open: boolean;
  onClose: () => void;
}

const LogPanel: React.FC<LogPanelProps> = ({ serviceId, open, onClose }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open && serviceId) {
      fetchLogs();
      timerRef.current = setInterval(fetchLogs, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [open, serviceId]);

  const fetchLogs = async () => {
    if (!serviceId) return;
    try {
      const data = await window.electronAPI.services.getLogs(serviceId);
      setLogs(data);
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      }, 50);
    } catch {
      // ignore
    }
  };

  const handleExport = () => {
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

  return (
    <Modal
      title={`服务日志: ${serviceId}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
    >
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ReloadOutlined />} onClick={fetchLogs} size="small">
          刷新
        </Button>
        <Button icon={<DownloadOutlined />} onClick={handleExport} size="small">
          导出
        </Button>
        <Input
          placeholder="过滤日志..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 200 }}
          size="small"
          allowClear
        />
      </Space>

      <div
        ref={containerRef}
        className="cyber-log-container cyber-bg"
        style={{
          background: '#000000',
          color: '#e0e0e0',
          padding: 12,
          borderRadius: 2,
          height: 400,
          overflow: 'auto',
          fontFamily: "'Fira Code', monospace",
          fontSize: 13,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {filteredLogs.length === 0 ? (
          <Empty description="暂无日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          filteredLogs.map((line, i) => {
            const isError = line.includes('[ERR]') || line.includes('[ERROR]');
            const isExit = line.includes('[EXIT]');
            return (
              <div key={i} style={{ color: isError ? '#ff4d4f' : isExit ? '#faad14' : '#e0e0e0' }}>
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
