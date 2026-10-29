FROM postgres:17-alpine
WORKDIR /cache-order-proof-1b5c34fd7eed4f3d837fc4cc71394a7a
RUN mkdir -p system && printf 'identical-system-payload\n' > system/installed && printf 'unused\n' > system/remove-me
RUN rm -f system/remove-me
COPY artifact.txt ./artifact.txt
ARG START_CMD
ENV START_CMD=${START_CMD}
CMD ["sh", "-c", "exec $START_CMD"]
