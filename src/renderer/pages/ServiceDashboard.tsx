import React, { useState, useEffect, useCallback } from 'react';
import { Space, Button, message, Modal } from 'antd';
import { PlusOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import ServiceTable from '../components/ServiceTable';
import ServiceForm from '../components/ServiceForm';
import LogPanel from '../components/LogPanel';
import AiDiagnosticsPanel from '../components/AiDiagnosticsPanel';
import type { DevService, ServiceRuntime } from '../../main/shared/types';

interface ServiceWithRuntime extends DevService {
  runtime: ServiceRuntime;
}

const ServiceDashboard: React.FC = () => {
  const [services, setServices] = useState<ServiceWithRuntime[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<DevService | null>(null);
  const [logServiceId, setLogServiceId] = useState<string | null>(null);
  const [diagnoseServiceId, setDiagnoseServiceId] = useState<string | null>(null);

  const refreshServices = useCallback(async () => {
    try {
      const list = await window.electronAPI.services.list();
      setServices(list);
    } catch (err) {
      message.error('获取服务列表失败');
    }
  }, []);

  useEffect(() => {
    refreshServices();
  }, [refreshServices]);

  useEffect(() => {
    const unsubscribeLog = window.electronAPI.onLog(() => {
      // Logs are polled on demand
    });

    const unsubscribeStatus = window.electronAPI.onStatusChange(() => {
      refreshServices();
    });

    const interval = setInterval(refreshServices, 2000);

    return () => {
      unsubscribeLog();
      unsubscribeStatus();
      clearInterval(interval);
    };
  }, [refreshServices]);

  const handleStart = async (id: string) => {
    try {
      setLoading(true);
      await window.electronAPI.services.start(id);
      message.success('启动成功');
      refreshServices();
    } catch (err: unknown) {
      message.error('启动失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async (id: string) => {
    try {
      setLoading(true);
      await window.electronAPI.services.stop(id);
      message.success('已停止');
      refreshServices();
    } catch (err: unknown) {
      message.error('停止失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async (id: string) => {
    try {
      setLoading(true);
      await window.electronAPI.services.restart(id);
      message.success('已重启');
      refreshServices();
    } catch (err: unknown) {
      message.error('重启失败: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleStartAll = async () => {
    try {
      setLoading(true);
      await window.electronAPI.services.startAll();
      message.success('全部启动');
      refreshServices();
    } catch (err: unknown) {
      message.error('启动全部失败');
    } finally {
      setLoading(false);
    }
  };

  const handleStopAll = async () => {
    Modal.confirm({
      title: '确认停止全部服务?',
      content: '这将停止所有正在运行的服务。',
      onOk: async () => {
        try {
          setLoading(true);
          await window.electronAPI.services.stopAll();
          message.success('全部停止');
          refreshServices();
        } catch {
          message.error('停止全部失败');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleAdd = () => {
    setEditingService(null);
    setFormOpen(true);
  };

  const handleEdit = (service: DevService) => {
    setEditingService(service);
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: '确认删除该服务?',
      content: '此操作不可撤销。',
      onOk: async () => {
        await window.electronAPI.services.delete(id);
        message.success('已删除');
        refreshServices();
      },
    });
  };

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    try {
      if (editingService) {
        await window.electronAPI.services.update(editingService.id, data);
        message.success('已更新');
      } else {
        await window.electronAPI.services.create(data);
        message.success('已创建');
      }
      setFormOpen(false);
      setEditingService(null);
      refreshServices();
    } catch (err: unknown) {
      message.error('保存失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleOpenUrl = async (id: string) => {
    try {
      await window.electronAPI.system.openUrl(id);
    } catch (err: unknown) {
      message.error('打开失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleOpenFolder = async (id: string) => {
    try {
      await window.electronAPI.system.openFolder(id);
    } catch (err: unknown) {
      message.error('打开目录失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加服务
        </Button>
        <Button icon={<PlayCircleOutlined />} onClick={handleStartAll} loading={loading}>
          启动全部
        </Button>
        <Button icon={<PauseCircleOutlined />} onClick={handleStopAll} loading={loading}>
          停止全部
        </Button>
      </Space>

      <ServiceTable
        services={services}
        loading={loading}
        onStart={handleStart}
        onStop={handleStop}
        onRestart={handleRestart}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onOpenUrl={handleOpenUrl}
        onOpenFolder={handleOpenFolder}
        onViewLogs={(id) => setLogServiceId(id)}
        onDiagnose={(id) => setDiagnoseServiceId(id)}
      />

      <ServiceForm
        open={formOpen}
        initialValues={editingService || undefined}
        onSubmit={handleFormSubmit}
        onCancel={() => {
          setFormOpen(false);
          setEditingService(null);
        }}
      />

      <LogPanel
        serviceId={logServiceId}
        open={logServiceId !== null}
        onClose={() => setLogServiceId(null)}
      />

      <AiDiagnosticsPanel
        serviceId={diagnoseServiceId}
        open={diagnoseServiceId !== null}
        onClose={() => setDiagnoseServiceId(null)}
        onRefreshServices={refreshServices}
      />
    </div>
  );
};

export default ServiceDashboard;
