FROM postgres:17-alpine
WORKDIR /cache-order-proof-1b5c34fd7eed4f3d837fc4cc71394a7a
ARG START_CMD
ENV START_CMD=${START_CMD}
RUN mkdir -p system && printf 'identical-system-payload\n' > system/installed && printf 'unused\n' > system/remove-me
COPY artifact.txt ./artifact.txt
RUN rm -f system/remove-me
CMD ["sh", "-c", "exec $START_CMD"]
