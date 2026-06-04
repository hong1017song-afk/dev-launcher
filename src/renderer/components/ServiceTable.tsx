import React from 'react';
import { Table, Tag, Button, Space, Tooltip, Typography } from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  LinkOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  BugOutlined,
} from '@ant-design/icons';
import type { DevService, ServiceRuntime } from '../../main/shared/types';
import type { ColumnsType } from 'antd/es/table';

interface ServiceWithRuntime extends DevService {
  runtime: ServiceRuntime;
}

interface ServiceTableProps {
  services: ServiceWithRuntime[];
  loading: boolean;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onEdit: (service: DevService) => void;
  onDelete: (id: string) => void;
  onOpenUrl: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onViewLogs: (id: string) => void;
  onDiagnose: (id: string) => void;
}

const statusColors: Record<string, string> = {
  stopped: 'default',
  starting: 'processing',
  running: 'success',
  stopping: 'warning',
  error: 'error',
};

const statusLabels: Record<string, string> = {
  stopped: '已停止',
  starting: '启动中',
  running: '运行中',
  stopping: '停止中',
  error: '错误',
};

const kindLabels: Record<string, string> = {
  web: 'Web',
  api: 'API',
  database: '数据库',
  redis: 'Redis',
  'docker-compose': 'Docker Compose',
  cli: 'CLI',
  custom: '自定义',
};

const ServiceTable: React.FC<ServiceTableProps> = ({
  services,
  loading,
  onStart,
  onStop,
  onRestart,
  onEdit,
  onDelete,
  onOpenUrl,
  onOpenFolder,
  onViewLogs,
  onDiagnose,
}) => {
  const columns: ColumnsType<ServiceWithRuntime> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: ServiceWithRuntime) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{text}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {record.id}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: '分组',
      dataIndex: 'group',
      key: 'group',
      width: 100,
      render: (text: string) => <Tag className="cyber-tag">{text}</Tag>,
    },
    {
      title: '类型',
      dataIndex: 'kind',
      key: 'kind',
      width: 100,
      render: (text: string) => <Tag className="cyber-tag" color="blue">{kindLabels[text] || text}</Tag>,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_: unknown, record: ServiceWithRuntime) => {
        const rt = record.runtime;
        return (
          <Tag className="cyber-tag" color={statusColors[rt?.status || 'stopped']}>
            {statusLabels[rt?.status || 'stopped']}
          </Tag>
        );
      },
    },
    {
      title: '端口',
      dataIndex: 'port',
      key: 'port',
      width: 70,
      render: (text?: number) => text || '-',
    },
    {
      title: '运行模式',
      dataIndex: 'runMode',
      key: 'runMode',
      width: 100,
      render: (text: string) => (
        <Tag className="cyber-tag" color={text === 'managed-process' ? 'green' : 'orange'}>
          {text === 'managed-process' ? '托管' : '终端'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 360,
      render: (_: unknown, record: ServiceWithRuntime) => {
        const isRunning = record.runtime?.status === 'running';
        const isStarting = record.runtime?.status === 'starting';
        const isStopping = record.runtime?.status === 'stopping';

        return (
          <Space size="small">
            {!isRunning && !isStarting ? (
              <Tooltip title="启动">
                <Button
                  size="small"
                  type="text"
                  style={{ color: 'var(--cyber-green)' }}
                  icon={<PlayCircleOutlined />}
                  loading={isStarting}
                  onClick={() => onStart(record.id)}
                  disabled={!record.enabled}
                />
              </Tooltip>
            ) : (
              <Tooltip title="停止">
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<PauseCircleOutlined />}
                  loading={isStopping}
                  onClick={() => onStop(record.id)}
                />
              </Tooltip>
            )}
            <Tooltip title="重启">
              <Button
                size="small"
                type="text"
                icon={<ReloadOutlined />}
                loading={isStarting || isStopping}
                onClick={() => onRestart(record.id)}
                disabled={!record.enabled}
              />
            </Tooltip>
            {(record.openUrl || record.port) && (
              <Tooltip title="打开网页">
                <Button
                  size="small"
                  type="text"
                  icon={<LinkOutlined />}
                  onClick={() => onOpenUrl(record.id)}
                />
              </Tooltip>
            )}
            <Tooltip title="打开目录">
              <Button
                size="small"
                type="text"
                icon={<FolderOpenOutlined />}
                onClick={() => onOpenFolder(record.id)}
              />
            </Tooltip>
            <Tooltip title="查看日志">
              <Button
                size="small"
                type="text"
                icon={<FileTextOutlined />}
                onClick={() => onViewLogs(record.id)}
              />
            </Tooltip>
            <Tooltip title="AI 诊断">
              <Button
                size="small"
                type="text"
                icon={<BugOutlined />}
                onClick={() => onDiagnose(record.id)}
              />
            </Tooltip>
            <Tooltip title="编辑">
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={() => onEdit(record)}
              />
            </Tooltip>
            <Tooltip title="删除">
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => onDelete(record.id)}
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <Table
      className="cyber-table"
      columns={columns}
      dataSource={services}
      rowKey="id"
      loading={loading}
      pagination={false}
      size="middle"
      scroll={{ x: 1000 }}
    />
  );
};

export default ServiceTable;
