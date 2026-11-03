import { TaskDetailPage } from '@/components/task-detail-page'

export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params
  return <TaskDetailPage taskId={taskId.toUpperCase()} />
}
