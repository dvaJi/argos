<template>
  <div
    class="prose prose-zinc prose-sm dark:prose-invert w-full max-w-none break-all"
    v-html="debouncedContent"
  ></div>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'

const props = withDefaults(
  defineProps<{
    content: string
    debug?: boolean
    messageId?: string
    threadId?: string
    smoothStreaming?: boolean
  }>(),
  {
    smoothStreaming: true
  }
)

const debouncedContent = ref(props.content)
let contentRevision = 0
let fastTimer: ReturnType<typeof setTimeout> | null = null
let slowTimer: ReturnType<typeof setTimeout> | null = null

const updateContent = (value: string) => {
  const revision = ++contentRevision

  if (fastTimer) clearTimeout(fastTimer)
  if (slowTimer) clearTimeout(slowTimer)

  if (props.smoothStreaming && value.length > 12_000) {
    slowTimer = setTimeout(() => {
      if (revision === contentRevision) {
        debouncedContent.value = value
      }
    }, 96)
  } else {
    fastTimer = setTimeout(() => {
      if (revision === contentRevision) {
        debouncedContent.value = value
      }
    }, 32)
  }
}

watch(
  () => props.content,
  (value) => {
    updateContent(value)
  }
)

onBeforeUnmount(() => {
  if (fastTimer) clearTimeout(fastTimer)
  if (slowTimer) clearTimeout(slowTimer)
})

defineEmits(['copy'])
</script>

<style lang="css">
@reference '../../assets/style.css';

.prose {
  contain: layout style paint;

  pre {
    margin-top: 0;
    margin-bottom: 0;
  }

  p {
    @apply my-2;
  }

  li p {
    padding-top: 0;
    padding-bottom: 0;
    margin-top: 0;
    margin-bottom: 0;
  }
  h1 {
    @apply text-2xl font-bold my-3 py-0;
  }
  h2 {
    @apply text-xl font-medium my-3 py-0;
  }
  h3 {
    @apply text-base font-medium my-2 py-0;
  }
  h4 {
    @apply text-sm font-medium my-2 py-0;
  }
  h5 {
    @apply text-sm my-1.5 py-0;
  }
  h6 {
    @apply text-sm my-1.5 py-0;
  }

  ul,
  ol {
    @apply my-1.5;
  }

  hr {
    @apply my-8;
  }

  a .markdown-renderer {
    display: inline;
  }

  table {
    @apply py-0 my-0;
    border-collapse: collapse;
    table-layout: auto;
  }

  thead,
  thead tr,
  thead th {
    @apply bg-muted;
  }

  th,
  td {
    @apply border-b not-last:border-r border-border;
  }

  tbody tr:last-child td {
    @apply border-b-0;
  }
}
</style>
